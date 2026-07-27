"use server";

/**
 * Server Actions for savings plans and daily contribution recording.
 * ----------------------------------------------------------------------------
 * Authorization rules:
 *  - createContributionPlanAction: ADMIN, or the customer's own AGENT
 *    (re-verified server-side — never trusting the client).
 *  - recordContributionAction: ADMIN, or the customer's own AGENT. This is
 *    the day-to-day action agents use, so it's scoped the same way as every
 *    other agent-facing customer mutation in this app.
 */
import { requireRole } from "@/lib/session";
import { createContributionPlan } from "@/server/services/contribution-plan.service";
import { recordContribution } from "@/server/services/contribution.service";
import { findCustomerProfileWithUserId } from "@/server/repositories/customer.repository";
import type { CreateContributionPlanInput, RecordContributionInput } from "@/validations/contribution";
import { fail } from "@/lib/action-result";
import { revalidatePath } from "next/cache";

async function assertCanManageCustomer(customerProfileId: string) {
  const user = await requireRole(["ADMIN", "AGENT"]);
  if (user.role === "AGENT") {
    const customer = await findCustomerProfileWithUserId(customerProfileId);
    if (!customer || customer.assignedAgentId !== user.id) {
      return { user: null, error: fail("You can only manage customers assigned to you.") };
    }
  }
  return { user, error: null };
}

export async function createContributionPlanAction(input: CreateContributionPlanInput) {
  const { user, error } = await assertCanManageCustomer(input.customerProfileId);
  if (error) return error;

  const result = await createContributionPlan(input);

  if (result.success) {
    revalidatePath("/admin/customers");
    revalidatePath(`/admin/customers/${input.customerProfileId}`);
    revalidatePath("/agent");
    revalidatePath(`/agent/customers/${input.customerProfileId}`);
    revalidatePath("/customer");
  }

  return result;
}

export async function recordContributionAction(input: RecordContributionInput) {
  const { user, error } = await assertCanManageCustomer(input.customerProfileId);
  if (error) return error;

  const result = await recordContribution(input, user!.id);

  if (result.success) {
    revalidatePath("/agent");
    revalidatePath("/agent/collections");
    revalidatePath(`/admin/customers/${input.customerProfileId}`);
    revalidatePath("/admin/payouts");
    revalidatePath("/customer");
  }

  return result;
}
