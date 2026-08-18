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
import { prisma } from "@/lib/prisma";
import {
  getAuditRequestContext,
  writeRequiredAuditLog,
  writeAuditLog,
} from "@/server/services/audit.service";
import { quickPayRevalidationPaths } from "@/lib/contribution-revalidation";

export async function searchQuickPayCustomersAction(query: string) {
  const user = await requireRole(["ADMIN", "AGENT"]);
  const search = query.trim();
  const customers = await prisma.customerProfile.findMany({
    where: {
      ...(user.role === "AGENT" ? { assignedAgentId: user.id } : {}),
      user: { isActive: true },
      // Include customers whose previous period was paid out: their next
      // successful payment automatically starts the next savings period.
      contributionPlans: { some: {} },
      ...(search ? { OR: [
        { customerCode: { contains: search, mode: "insensitive" } },
        { user: { name: { contains: search, mode: "insensitive" } } },
        { user: { phone: { contains: search } } },
      ] } : {}),
    },
    select: { id: true, customerCode: true, user: { select: { name: true, phone: true } } },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
  return customers.map((customer) => ({ id: customer.id, customerCode: customer.customerCode, name: customer.user.name, phone: customer.user.phone }));
}

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
  await writeAuditLog({ actorId: user!.id, actorRole: user!.role, action: "SAVINGS_PERIOD_STARTED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "CustomerProfile", entityId: input.customerProfileId, summary: result.success ? "Savings period started." : result.message, metadata: result.success ? { dailyAmount: input.dailyAmount, startDate: input.startDate.toISOString() } : undefined });

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

  const requestContext = await getAuditRequestContext();
  const audit = { actorId: user!.id, actorRole: user!.role, ...requestContext };
  const result = await recordContribution(input, user!.id, audit);

  if (!result.success) {
    await writeRequiredAuditLog({
      actorId: user!.id,
      actorRole: user!.role,
      action: input.status === "COLLECTED" ? "CONTRIBUTION_RECORDED" : "MISSED_VISIT_RECORDED",
      outcome: "FAILURE",
      entityType: "CustomerProfile",
      entityId: input.customerProfileId,
      summary: result.message,
    }, requestContext);
  }

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
    const previous = await prisma.contributionPlan.findFirst({
      where: { customerProfileId },
      orderBy: { createdAt: "desc" },
    });
    if (!previous) return ok({ plan: null, alreadyPaidToday: false });
    return ok({
      plan: { id: previous.id, dailyAmount: Number(previous.dailyAmount), durationDays: 31 },
      alreadyPaidToday: false,
    });
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

  const requestContext = await getAuditRequestContext();
  const audit = { actorId: user!.id, actorRole: user!.role, ...requestContext };
  let result: Awaited<ReturnType<typeof recordQuickPay>>;
  try {
    result = await recordQuickPay(input, user!.id, user!.role === "ADMIN", audit);
  } catch (error) {
    console.error("Quick Pay failed before completion", error);
    await writeRequiredAuditLog({
      actorId: user!.id,
      actorRole: user!.role,
      action: "QUICK_PAY",
      outcome: "FAILURE",
      entityType: "CustomerProfile",
      entityId: input.customerProfileId,
      summary: "Quick Pay failed due to an unexpected server error.",
    }, requestContext);
    return fail("Payment could not be recorded. No money was added. Please try again.");
  }

  if (!result.success) {
    await writeRequiredAuditLog({
      actorId: user!.id,
      actorRole: user!.role,
      action: "QUICK_PAY",
      outcome: "FAILURE",
      entityType: "CustomerProfile",
      entityId: input.customerProfileId,
      summary: result.message,
    }, requestContext);
  }

  if (result.success) {
    for (const path of quickPayRevalidationPaths(input.customerProfileId)) {
      revalidatePath(path);
    }
  }

  return result;
}
