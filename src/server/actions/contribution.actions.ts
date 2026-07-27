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
 *  - recordQuickPayAction: ADMIN, or the customer's own AGENT — same scope
 *    rule as recordContributionAction. The Admin-only override/backdating
 *    capability inside Quick Pay is gated a SECOND time inside
 *    recordQuickPay() itself (contribution.service.ts), by an explicit
 *    `actorIsAdmin` flag computed here from the re-verified session role —
 *    never from anything the client sent.
 */
import { requireRole } from "@/lib/session";
import { createContributionPlan } from "@/server/services/contribution-plan.service";
import { recordContribution, recordQuickPay } from "@/server/services/contribution.service";
import { findCustomerProfileWithUserId } from "@/server/repositories/customer.repository";
import { findActivePlanForCustomer } from "@/server/repositories/contribution-plan.repository";
import { findContributionForPlanAndDate } from "@/server/repositories/contribution.repository";
import { today } from "@/lib/date";
import type {
  CreateContributionPlanInput,
  RecordContributionInput,
  QuickPayInput,
} from "@/validations/contribution";
import { ok, fail } from "@/lib/action-result";
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
    revalidatePath(`/agent/customers/${input.customerProfileId}`);
    revalidatePath("/admin/payouts");
    revalidatePath("/customer");
  }

  return result;
}

/**
 * Look up a customer's active savings plan for the Quick Pay modal: shown
 * automatically once a customer is selected (plan's daily amount, to
 * pre-fill the Amount field), plus whether today already has a normal
 * (non-override) payment recorded — so the modal can warn the user (or, if
 * they're an Admin, offer the override checkbox) BEFORE they fill in the
 * rest of the form and submit.
 */
export async function getCustomerPlanForQuickPayAction(customerProfileId: string) {
  const { error } = await assertCanManageCustomer(customerProfileId);
  if (error) return error;

  const plan = await findActivePlanForCustomer(customerProfileId);
  if (!plan) {
    return ok({ plan: null, alreadyPaidToday: false });
  }

  const existing = await findContributionForPlanAndDate(plan.id, today());

  return ok({
    plan: { id: plan.id, dailyAmount: Number(plan.dailyAmount), durationDays: plan.durationDays },
    alreadyPaidToday: !!existing,
  });
}

/**
 * "Quick Pay" — record a payment from the modal on the Admin/Agent
 * dashboards (and the Customer Tracking page). Same customer-scoping rule
 * as recordContributionAction: ADMIN, or the customer's own AGENT.
 */
export async function recordQuickPayAction(input: QuickPayInput) {
  const { user, error } = await assertCanManageCustomer(input.customerProfileId);
  if (error) return error;

  const result = await recordQuickPay(input, user!.id, user!.role === "ADMIN");

  if (result.success) {
    revalidatePath("/agent");
    revalidatePath("/agent/collections");
    revalidatePath("/admin");
    revalidatePath(`/admin/customers/${input.customerProfileId}`);
    revalidatePath(`/agent/customers/${input.customerProfileId}`);
    revalidatePath("/admin/payouts");
    revalidatePath("/customer");
  }

  return result;
}
