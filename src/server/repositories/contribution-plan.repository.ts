/**
 * ContributionPlan data-access layer.
 * ----------------------------------------------------------------------------
 * A ContributionPlan is one customer's savings cycle. Queries here are kept
 * simple and Prisma-shaped; the "how many days paid / missed / remaining,
 * is this plan actually ready for payout" business logic lives in
 * contribution-plan.service.ts (findActivePlanWithProgress), not here.
 */
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/date";

/** The customer's current ACTIVE plan, if any — a customer has at most one. */
export async function findActivePlanForCustomer(customerProfileId: string) {
  return prisma.contributionPlan.findFirst({
    where: { customerProfileId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Every ACTIVE plan belonging to one agent's customers, together with
 * (only) that plan's Contribution row for `date` if one exists — the data
 * source for the Agent's "Today's Collections" list: one row per customer
 * with an active plan, pre-loaded with whether today has already been
 * recorded so the page can render "Save" vs. "Already recorded" per row
 * without an extra query per customer.
 */
export async function listActivePlansForAgent(agentId: string, date: Date) {
  return prisma.contributionPlan.findMany({
    where: { status: "ACTIVE", customerProfile: { assignedAgentId: agentId } },
    include: {
      customerProfile: {
        include: { user: { select: { id: true, name: true, phone: true, isActive: true } } },
      },
      contributions: { where: { collectionDate: toDateOnly(date) } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/** All plans (any status) for a customer, most recent first — for history views. */
export async function listPlansForCustomer(customerProfileId: string) {
  return prisma.contributionPlan.findMany({
    where: { customerProfileId },
    orderBy: { createdAt: "desc" },
    include: { payout: true },
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
 * List plans that have reached COMPLETED (all required days paid) and have
 * no payout yet — this is exactly "customers ready for payout". Optionally
 * scoped to a single agent's customers (for an Agent's own view, if ever
 * needed) or filtered by a search string.
 */
export async function listPlansReadyForPayout(options?: {
  agentId?: string;
  search?: string;
}) {
  const plans = await prisma.contributionPlan.findMany({
    where: {
      status: "ACTIVE",
      payout: null,
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
      _count: { select: { allocations: true } },
      contributions: { where: { status: "COLLECTED" }, select: { amount: true } },
    },
    orderBy: { updatedAt: "asc" },
  });
  return plans.filter((plan) => plan._count.allocations >= 2);
}
