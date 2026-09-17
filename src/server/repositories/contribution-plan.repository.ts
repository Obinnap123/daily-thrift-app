/**
 * ContributionPlan data-access layer.
 * ----------------------------------------------------------------------------
 * A ContributionPlan is one customer's savings cycle. Queries here are kept
 * simple and Prisma-shaped; the "how many days paid / missed / remaining,
 * is this plan actually eligible for payout" business logic lives in
 * contribution-plan.service.ts (findActivePlanWithProgress), not here.
 */
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/date";
import { buildPayoutMonthOptions } from "@/lib/payout-selection";

/** The customer's current ACTIVE plan, if any — a customer has at most one. */
export async function findActivePlanForCustomer(customerProfileId: string) {
  return prisma.contributionPlan.findFirst({
    where: { customerProfileId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Every ACTIVE plan belonging to one agent's customers, together with that
 * plan's normal Contribution row and funded allocation for `date`.
 * Allocation coverage is deliberately loaded separately from transaction
 * activity because one earlier payment may cover several later days.
 */
export async function listActivePlansForAgent(agentId: string, date: Date) {
  return prisma.contributionPlan.findMany({
    where: { status: "ACTIVE", customerProfile: { assignedAgentId: agentId } },
    include: {
      customerProfile: {
        include: { user: { select: { id: true, name: true, phone: true, isActive: true } } },
      },
      contributions: {
        where: { collectionDate: toDateOnly(date) },
        orderBy: { createdAt: "desc" },
      },
      allocations: {
        where: { coverageDate: toDateOnly(date) },
        select: {
          id: true,
          contribution: { select: { collectionDate: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** All plans (any status) for a customer, most recent first — for history views. */
export async function listPlansForCustomer(customerProfileId: string) {
  return prisma.contributionPlan.findMany({
    where: { customerProfileId },
    orderBy: { createdAt: "desc" },
    include: { payouts: { orderBy: { payoutDate: "desc" } } },
  });
}

export async function findPlanById(contributionPlanId: string) {
  return prisma.contributionPlan.findUnique({
    where: { id: contributionPlanId },
    include: {
      customerProfile: {
        include: { user: true, assignedAgent: { select: { id: true, name: true } } },
      },
    },
  });
}

/**
 * List active plans with enough unpaid funded days to request either a
 * partial or full payout. Optionally scoped to one agent's customers or
 * filtered by a search string.
 */
export async function listPlansReadyForPayout(options?: {
  agentId?: string;
  search?: string;
}) {
  const [plans, settings] = await Promise.all([prisma.contributionPlan.findMany({
    where: {
      status: "ACTIVE",
      ...(options?.agentId ? { customerProfile: { assignedAgentId: options.agentId } } : {}),
      ...(options?.search
        ? {
            customerProfile: {
              OR: [
                { customerCode: { contains: options.search, mode: "insensitive" } },
                { user: { name: { contains: options.search, mode: "insensitive" } } },
              ],
            },
          }
        : {}),
    },
    include: {
      customerProfile: {
        include: { user: { select: { id: true, name: true, phone: true } } },
      },
      allocations: {
        orderBy: { coverageDate: "asc" },
        select: { id: true, coverageDate: true, amount: true },
      },
      payouts: { select: { months: { select: { monthStart: true, grossSavings: true, creditAmount: true, commissionAmount: true } } } },
      monthlyRates: { orderBy: { monthStart: "asc" } },
    },
    orderBy: { updatedAt: "asc" },
  }), prisma.businessSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} })]);

  return plans
    .map((plan) => ({
      ...plan,
      payoutMonths: buildPayoutMonthOptions({
        allocations: plan.allocations,
        rates: plan.monthlyRates,
        planDailyAmount: plan.dailyAmount,
        creditBalance: plan.creditBalance,
        nextCoverageDate: plan.nextCoverageDate,
        priorPayoutMonths: plan.payouts.flatMap((payout) => payout.months),
      }),
      commissionDays: settings.commissionDays,
    }))
    .filter((plan) => plan.allocations.length >= settings.minimumPayoutSlots
      && plan.payoutMonths.some((month) => month.grossSavings > (month.commissionCharged ? 0 : month.dailyAmount * settings.commissionDays)));
}
