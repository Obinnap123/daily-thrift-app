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
import { registerCustomer, reassignCustomerAgent } from "@/server/services/customer.service";
import type { RegisterCustomerInput, ReassignAgentInput } from "@/validations/customer";
import { revalidatePath } from "next/cache";

export async function registerCustomerAction(input: RegisterCustomerInput) {
  const user = await requireRole(["ADMIN", "AGENT"]);

  // Enforce agent scoping server-side — never trust the client's
  // assignedAgentId if the caller is an Agent (see file header comment).
  const scopedInput: RegisterCustomerInput =
    user.role === "AGENT" ? { ...input, assignedAgentId: user.id } : input;

  const result = await registerCustomer(scopedInput, user.id);

  if (result.success) {
    revalidatePath("/admin/customers");
    revalidatePath("/agent");
  }

  return result;
}

export async function reassignCustomerAgentAction(input: ReassignAgentInput) {
  const user = await requireRole("ADMIN");

  const result = await reassignCustomerAgent(input, user.id);

  if (result.success) {
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${input.customerProfileId}`);
  }

  return result;
}
