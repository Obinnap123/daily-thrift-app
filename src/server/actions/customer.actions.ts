"use server";

/**
 * Server Actions for Customer registration & agent reassignment.
 * ----------------------------------------------------------------------------
 * Authorization rules enforced here (not in the service layer):
 *  - registerCustomerAction: ADMIN or AGENT may call it.
 *      - If the caller is an AGENT, we IGNORE whatever assignedAgentId the
 *        client sent and force it to the agent's own id. This is the actual
 *        enforcement of "agents can only manage customers assigned to
 *        them" at creation time — an Agent cannot register a customer and
 *        assign them to a different agent, even by tampering with the
 *        client-side form payload.
 *      - If the caller is ADMIN, the client-supplied assignedAgentId is
 *        used as-is (Admin can assign to any agent).
 *  - reassignCustomerAgentAction: ADMIN only (agent rotation).
 */
import { requireRole } from "@/lib/session";
import {
  registerCustomer,
  reassignCustomerAgent,
  updateCustomer,
  uploadCustomerPassportPhoto,
  bulkAssignCustomersToAgent,
  deleteCustomer,
} from "@/server/services/customer.service";
import { findCustomerProfileWithUserId } from "@/server/repositories/customer.repository";
import type {
  RegisterCustomerInput,
  ReassignAgentInput,
  EditCustomerInput,
  BulkAssignCustomersInput,
  DeleteCustomerInput,
} from "@/validations/customer";
import { fail } from "@/lib/action-result";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/server/services/audit.service";

export async function registerCustomerAction(input: RegisterCustomerInput) {
  const user = await requireRole(["ADMIN", "AGENT"]);

  // Enforce agent scoping server-side — never trust the client's
  // assignedAgentId if the caller is an Agent (see file header comment).
  const scopedInput: RegisterCustomerInput =
    user.role === "AGENT" ? { ...input, assignedAgentId: user.id } : input;

  const result = await registerCustomer(scopedInput, user.id);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "CUSTOMER_REGISTERED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "CustomerProfile", summary: result.success ? `Customer ${input.fullName} registered.` : result.message });

  if (result.success) {
    revalidatePath("/admin/customers");
    revalidatePath("/agent");
  }

  return result;
}

export async function reassignCustomerAgentAction(input: ReassignAgentInput) {
  const user = await requireRole("ADMIN");

  const result = await reassignCustomerAgent(input, user.id);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "CUSTOMER_REASSIGNED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "CustomerProfile", entityId: input.customerProfileId, summary: result.success ? "Customer agent assignment changed." : result.message });

  if (result.success) {
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${input.customerProfileId}`);
  }

  return result;
}

/**
 * Update a customer's profile (name, phone, ID number).
 * Allowed for ADMIN (any customer) or AGENT (only their OWN assigned
 * customers — re-verified server-side below, never trusting the client).
 */
export async function updateCustomerAction(input: EditCustomerInput) {
  const user = await requireRole(["ADMIN", "AGENT"]);

  if (user.role === "AGENT") {
    const customer = await findCustomerProfileWithUserId(input.customerProfileId);
    if (!customer || customer.assignedAgentId !== user.id) {
      return fail("You can only edit customers assigned to you.");
    }
  }

  const result = await updateCustomer(input);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "CUSTOMER_UPDATED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "CustomerProfile", entityId: input.customerProfileId, summary: result.success ? "Customer details updated." : result.message });

  if (result.success) {
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${input.customerProfileId}`);
    revalidatePath("/agent");
    revalidatePath(`/agent/customers/${input.customerProfileId}`);
  }

  return result;
}

/**
 * Upload/replace a customer's passport photo.
 * Same ADMIN-or-own-Agent authorization rule as updateCustomerAction.
 *
 * Takes FormData (not a typed object) because file uploads through a
 * Server Action must be passed as `multipart/form-data` — a `File` object
 * cannot be serialized as a plain JSON argument the way other Server
 * Action inputs in this app are.
 */
export async function uploadCustomerPhotoAction(formData: FormData) {
  const user = await requireRole(["ADMIN", "AGENT"]);

  const customerProfileId = formData.get("customerProfileId");
  const file = formData.get("photo");

  if (typeof customerProfileId !== "string" || !customerProfileId) {
    return fail("Missing customer reference.");
  }
  if (!(file instanceof File)) {
    return fail("Please choose a photo to upload.");
  }

  if (user.role === "AGENT") {
    const customer = await findCustomerProfileWithUserId(customerProfileId);
    if (!customer || customer.assignedAgentId !== user.id) {
      return fail("You can only edit customers assigned to you.");
    }
  }

  const result = await uploadCustomerPassportPhoto(customerProfileId, file);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "CUSTOMER_PHOTO_UPDATED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "CustomerProfile", entityId: customerProfileId, summary: result.success ? "Customer passport photo updated." : result.message });

  if (result.success) {
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${customerProfileId}`);
    revalidatePath("/agent");
    revalidatePath(`/agent/customers/${customerProfileId}`);
    revalidatePath("/customer");
  }

  return result;
}

/**
 * Bulk-assign customers to an agent — Admin only, from the Agent detail
 * page's "Assign Customers" section.
 */
export async function bulkAssignCustomersAction(input: BulkAssignCustomersInput) {
  const user = await requireRole("ADMIN");

  const result = await bulkAssignCustomersToAgent(input, user.id);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "CUSTOMERS_BULK_ASSIGNED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "User", entityId: input.agentId, summary: result.success ? `${result.data.assignedCount} customers assigned.` : result.message });

  if (result.success) {
    revalidatePath("/admin/agents");
    revalidatePath(`/admin/agents/${input.agentId}`);
    revalidatePath("/admin/customers");
  }

  return result;
}

/**
 * Permanently delete a customer registration — Admin only. The service
 * layer's own zero-activity guard (see deleteCustomer()) is the real
 * safety check; this action only enforces WHO may attempt it.
 */
export async function deleteCustomerAction(input: DeleteCustomerInput) {
  const user = await requireRole("ADMIN");

  const result = await deleteCustomer(input);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "CUSTOMER_DELETED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "CustomerProfile", entityId: input.customerProfileId, summary: result.success ? "Unused customer registration deleted." : result.message });

  if (result.success) {
    revalidatePath("/admin/customers");
    revalidatePath("/admin");
    revalidatePath("/admin/agents");
  }

  return result;
}
