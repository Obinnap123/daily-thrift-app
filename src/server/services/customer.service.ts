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
import {
  registerCustomerSchema,
  reassignAgentSchema,
  type RegisterCustomerInput,
  type ReassignAgentInput,
} from "@/validations/customer";
import { findUserByPhone } from "@/server/repositories/user.repository";
import { findCustomerProfileByIdNumber } from "@/server/repositories/customer.repository";
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
): Promise<ActionResult<{ userId: string; customerProfileId: string }>> {
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

    return { userId: user.id, customerProfileId: customerProfile.id };
  });

  return ok(result);
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
