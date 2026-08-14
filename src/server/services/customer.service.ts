/**
 * Customer business logic.
 * ----------------------------------------------------------------------------
 * Two operations live here:
 *  1. registerCustomer — creates the User + CustomerProfile + the initial
 *     AgentAssignmentLog row, all inside a single DB transaction so we never
 *     end up with a customer that has no assignment history, or a User
 *     without a matching CustomerProfile if something fails halfway.
 *  2. reassignCustomerAgent — Admin-only "rotate agent" operation. Updates
 *     CustomerProfile.assignedAgentId AND appends a new AgentAssignmentLog
 *     row in the same transaction, so the log is always a complete,
 *     trustworthy history of every assignment change.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { generateCustomerCode } from "@/lib/customer-code";
import { savePassportPhoto, deletePassportPhoto, PhotoUploadError } from "@/lib/file-upload";
import {
  registerCustomerSchema,
  reassignAgentSchema,
  editCustomerSchema,
  bulkAssignCustomersSchema,
  deleteCustomerSchema,
  type RegisterCustomerInput,
  type ReassignAgentInput,
  type EditCustomerInput,
  type BulkAssignCustomersInput,
  type DeleteCustomerInput,
} from "@/validations/customer";
import { findUserByPhone } from "@/server/repositories/user.repository";
import {
  findCustomerProfileByIdNumber,
  findCustomerProfileWithUserId,
  countCustomerFinancialActivity,
} from "@/server/repositories/customer.repository";
import { findAgentById } from "@/server/repositories/agent.repository";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/**
 * Register a new customer.
 *
 * @param input        Form data (name, phone, idNumber, assignedAgentId, password).
 * @param performedById The id of the Admin/Agent performing this registration
 *                      (recorded as the assignment log's `changedBy`).
 */
export async function registerCustomer(
  input: RegisterCustomerInput,
  performedById: string
): Promise<ActionResult<{ userId: string; customerProfileId: string; customerCode: string }>> {
  const parsed = registerCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { fullName, phone, idNumber, assignedAgentId, password } = parsed.data;
  const normalizedPhone = normalizePhone(phone);

  // Friendly duplicate checks up front (avoids a raw constraint-violation
  // error reaching the user as a generic failure).
  const existingByPhone = await findUserByPhone(normalizedPhone);
  if (existingByPhone) {
    return fail("A customer with this phone number is already registered.", {
      phone: "This phone number is already registered.",
    });
  }

  const existingByIdNumber = await findCustomerProfileByIdNumber(idNumber);
  if (existingByIdNumber) {
    return fail("A customer with this ID number is already registered.", {
      idNumber: "This ID number is already registered.",
    });
  }

  const agent = await findAgentById(assignedAgentId);
  if (!agent) {
    return fail("The selected agent could not be found.", {
      assignedAgentId: "Select a valid agent.",
    });
  }
  if (!agent.isActive) {
    return fail("The selected agent is currently inactive. Choose another agent.", {
      assignedAgentId: "This agent is inactive.",
    });
  }

  const passwordHash = await hashPassword(password);

  // Draw the unique customer code from its dedicated Postgres sequence
  // BEFORE the transaction — nextval() on a sequence is its own atomic
  // operation and does not need to (and should not) be part of the
  // customer-creation transaction below.
  const customerCode = await generateCustomerCode();

  // Transaction: create the login account, the thrift profile, and the
  // very first assignment-log entry (previousAgentId = null) together. If
  // any step fails, everything rolls back — we never end up with a
  // customer record that's missing its profile or its assignment history.
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: fullName,
        phone: normalizedPhone,
        passwordHash,
        role: "CUSTOMER",
      },
    });

    const customerProfile = await tx.customerProfile.create({
      data: {
        userId: user.id,
        idNumber,
        assignedAgentId,
        customerCode,
      },
    });

    await tx.agentAssignmentLog.create({
      data: {
        customerProfileId: customerProfile.id,
        previousAgentId: null,
        newAgentId: assignedAgentId,
        changedById: performedById,
        note: "Initial registration",
      },
    });

    return { userId: user.id, customerProfileId: customerProfile.id, customerCode };
  });

  return ok(result);
}

/**
 * Update a customer's editable profile fields (name, phone, ID number).
 * Does NOT touch assignedAgentId (see editCustomerSchema comment) or
 * passportPhotoUrl (handled separately by uploadCustomerPassportPhoto,
 * since that's a file-upload concern, not a form-field concern).
 */
export async function updateCustomer(
  input: EditCustomerInput
): Promise<ActionResult<{ customerProfileId: string }>> {
  const parsed = editCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { customerProfileId, fullName, phone, idNumber } = parsed.data;

  const existing = await findCustomerProfileWithUserId(customerProfileId);
  if (!existing) {
    return fail("Customer not found.");
  }

  const normalizedPhone = normalizePhone(phone);

  // Duplicate checks that EXCLUDE this customer's own current record —
  // otherwise editing a customer without changing their phone/ID number
  // would incorrectly flag "already registered" against themselves.
  const existingByPhone = await findUserByPhone(normalizedPhone);
  if (existingByPhone && existingByPhone.id !== existing.userId) {
    return fail("Another customer is already registered with this phone number.", {
      phone: "This phone number is already registered.",
    });
  }

  if (idNumber !== existing.idNumber) {
    const existingByIdNumber = await findCustomerProfileByIdNumber(idNumber);
    if (existingByIdNumber && existingByIdNumber.id !== customerProfileId) {
      return fail("Another customer is already registered with this ID number.", {
        idNumber: "This ID number is already registered.",
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.userId },
      data: {
        name: fullName,
        phone: normalizedPhone,
        // Phone is the customer's login identifier, so changing it revokes
        // sessions issued for the previous credential identity.
        ...(normalizedPhone !== existing.user.phone
          ? { sessionVersion: { increment: 1 } }
          : {}),
      },
    });
    await tx.customerProfile.update({
      where: { id: customerProfileId },
      data: { idNumber },
    });
  });

  return ok({ customerProfileId });
}

/**
 * Upload (or replace) a customer's passport photo.
 * If the customer already had a photo, the old file is deleted after the
 * new one is successfully saved and the database row is updated — so a
 * failed upload never leaves the customer with no photo at all.
 */
export async function uploadCustomerPassportPhoto(
  customerProfileId: string,
  file: File
): Promise<ActionResult<{ passportPhotoUrl: string }>> {
  const existing = await prisma.customerProfile.findUnique({
    where: { id: customerProfileId },
    select: { id: true, passportPhotoUrl: true },
  });
  if (!existing) {
    return fail("Customer not found.");
  }

  let newPhotoUrl: string;
  try {
    newPhotoUrl = await savePassportPhoto(customerProfileId, file);
  } catch (error) {
    if (error instanceof PhotoUploadError) {
      return fail(error.message);
    }
    throw error;
  }

  try {
    await prisma.customerProfile.update({
      where: { id: customerProfileId },
      data: { passportPhotoUrl: newPhotoUrl },
    });
  } catch (error) {
    // Do not leave a private object orphaned when the database write fails.
    await deletePassportPhoto(customerProfileId, newPhotoUrl).catch((cleanupError) => {
      console.error("Failed to remove an unreferenced passport photo.", cleanupError);
    });
    throw error;
  }

  // Clean up the old file only after the new one is safely stored+saved.
  await deletePassportPhoto(customerProfileId, existing.passportPhotoUrl).catch((error) => {
    // The new photo is already committed. A cleanup failure must not make the
    // successful replacement look unsuccessful to the user.
    console.error("Failed to remove the replaced passport photo.", error);
  });

  return ok({ passportPhotoUrl: newPhotoUrl });
}

/**
 * Bulk-assign one or more existing customers to a given agent — the
 * agent-centric equivalent of reassignCustomerAgent above (which rotates
 * ONE customer from that customer's own detail page). Used from the Agent
 * detail page's "Assign Customers" picker to move several customers onto
 * this agent in a single action.
 *
 * Every customer moved gets its own AgentAssignmentLog row (same audit
 * guarantee as single reassignment) — a bulk action must never be less
 * auditable than doing the same thing one at a time.
 */
export async function bulkAssignCustomersToAgent(
  input: BulkAssignCustomersInput,
  performedById: string
): Promise<ActionResult<{ assignedCount: number }>> {
  const parsed = bulkAssignCustomersSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Select at least one customer to assign.");
  }

  const { agentId, customerProfileIds, note } = parsed.data;

  const agent = await findAgentById(agentId);
  if (!agent) {
    return fail("Agent not found.");
  }
  if (!agent.isActive) {
    return fail("Cannot assign customers to an inactive agent.");
  }

  const customers = await prisma.customerProfile.findMany({
    where: { id: { in: customerProfileIds } },
    select: { id: true, assignedAgentId: true },
  });
  if (customers.length === 0) {
    return fail("None of the selected customers could be found.");
  }

  // Skip any customer already assigned to this agent — nothing to log or
  // change for them, and avoids a confusing "no-op reassignment" audit row.
  const toReassign = customers.filter((customer) => customer.assignedAgentId !== agentId);
  if (toReassign.length === 0) {
    return fail("All selected customers are already assigned to this agent.");
  }

  await prisma.$transaction(async (tx) => {
    for (const customer of toReassign) {
      await tx.customerProfile.update({
        where: { id: customer.id },
        data: { assignedAgentId: agentId },
      });
      await tx.agentAssignmentLog.create({
        data: {
          customerProfileId: customer.id,
          previousAgentId: customer.assignedAgentId,
          newAgentId: agentId,
          changedById: performedById,
          note: note || "Bulk assignment",
        },
      });
    }
  });

  return ok({ assignedCount: toReassign.length });
}

/**
 * Reassign ("rotate") the agent responsible for a customer. Admin-only —
 * the caller (Server Action) must verify the session role before invoking
 * this.
 */
export async function reassignCustomerAgent(
  input: ReassignAgentInput,
  performedById: string
): Promise<ActionResult<{ customerProfileId: string }>> {
  const parsed = reassignAgentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { customerProfileId, newAgentId, note } = parsed.data;

  const customerProfile = await prisma.customerProfile.findUnique({
    where: { id: customerProfileId },
  });
  if (!customerProfile) {
    return fail("Customer not found.");
  }

  const newAgent = await findAgentById(newAgentId);
  if (!newAgent) {
    return fail("The selected agent could not be found.", {
      newAgentId: "Select a valid agent.",
    });
  }
  if (!newAgent.isActive) {
    return fail("The selected agent is currently inactive. Choose another agent.", {
      newAgentId: "This agent is inactive.",
    });
  }

  if (customerProfile.assignedAgentId === newAgentId) {
    return fail("This customer is already assigned to that agent.", {
      newAgentId: "Choose a different agent to reassign.",
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.customerProfile.update({
      where: { id: customerProfileId },
      data: { assignedAgentId: newAgentId },
    });

    await tx.agentAssignmentLog.create({
      data: {
        customerProfileId,
        previousAgentId: customerProfile.assignedAgentId,
        newAgentId,
        changedById: performedById,
        note: note || null,
      },
    });
  });

  return ok({ customerProfileId });
}

/**
 * Permanently delete a customer registration — Admin only (re-verified in
 * the Server Action, never trusted from the client).
 * ----------------------------------------------------------------------------
 * Deliberately blocked whenever the customer has ANY recorded Contribution
 * or Payout row. This is a real financial/audit trail — once a single
 * naira has been logged as collected (or paid out) for a customer, their
 * record must be preserved forever, exactly like the reasoning behind
 * "deactivate, don't delete" for Agents. A brand-new registration that was
 * created by mistake (wrong person, duplicate entry, typo'd during setup)
 * and has NEVER had a single payment recorded is the only case this is for
 * — hence the zero-activity guard below.
 *
 * Deleting the CustomerProfile row cascades (onDelete: Cascade in the
 * schema) to also remove its AgentAssignmentLog rows and the underlying
 * User row (via the CustomerProfile -> User relation's own onDelete:
 * Cascade) in the same transaction — Prisma's referential actions handle
 * this automatically as part of a single delete, so no need for a manual
 * multi-step teardown here.
 */
export async function deleteCustomer(
  input: DeleteCustomerInput
): Promise<ActionResult<{ customerProfileId: string }>> {
  const parsed = deleteCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Invalid request.");
  }

  const { customerProfileId } = parsed.data;

  const existing = await findCustomerProfileWithUserId(customerProfileId);
  if (!existing) {
    return fail("Customer not found.");
  }

  const { contributionCount, payoutCount } = await countCustomerFinancialActivity(
    customerProfileId
  );
  if (contributionCount > 0 || payoutCount > 0) {
    return fail(
      "This customer has recorded payments or payouts and cannot be deleted. " +
        "Deactivate the customer's agent instead if they need to be removed from " +
        "active collection, or contact support for a corrected record."
    );
  }

  // Deleting the User row cascades to CustomerProfile (and from there to
  // AgentAssignmentLog) via the schema's onDelete: Cascade relations —
  // deleting the User (rather than the CustomerProfile directly) also
  // removes their login account, which is the whole point of "delete this
  // registration" rather than just "unlink this profile".
  await prisma.user.delete({ where: { id: existing.userId } });

  await deletePassportPhoto(customerProfileId, existing.passportPhotoUrl).catch((error) => {
    console.error("Failed to remove a deleted customer's passport photo.", error);
  });

  return ok({ customerProfileId });
}
