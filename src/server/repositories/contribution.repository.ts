/**
 * Contribution data-access layer.
 * ----------------------------------------------------------------------------
 * This is the single most frequently queried table in the system — every
 * dashboard (Agent Collection Summary, Admin Dashboard, Customer Savings
 * Progress) and every Report is ultimately an aggregate over `contributions`
 * rows. Keeping every one of those aggregate queries here (rather than
 * scattering raw prisma calls through pages) means the definition of "what
 * counts as collected today / this week / this month" lives in exactly one
 * place.
 */
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/date";

/** A single day's Contribution row for a given plan, if one was recorded. */
export async function findContributionForPlanAndDate(
  contributionPlanId: string,
  date: Date
) {
  return prisma.contribution.findUnique({
    where: {
      contributionPlanId_collectionDate: {
        contributionPlanId,
        collectionDate: toDateOnly(date),
      },
    },
  });
}

/** Full contribution history for a plan, newest first — for Savings Progress / receipts. */
export async function listContributionsForPlan(contributionPlanId: string) {
  return prisma.contribution.findMany({
    where: { contributionPlanId },
    orderBy: { collectionDate: "desc" },
  });
}

/**
 * Sum of COLLECTED amounts for one agent within a date range (inclusive) —
 * the building block for "Total collected today/this week/this month" on
 * the Agent Collection Summary, and for expectedCash on End-of-Day
 * Reconciliation.
 */
export async function sumCollectedByAgent(
  agentId: string,
  range: { start: Date; end: Date }
): Promise<number> {
  const result = await prisma.contribution.aggregate({
    where: {
      collectedById: agentId,
      status: "COLLECTED",
      collectionDate: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) },
    },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

/** Count of COLLECTED / MISSED rows for one agent on one specific date. */
export async function countByAgentAndDate(agentId: string, date: Date) {
  const day = toDateOnly(date);
  const [collected, missed, visited] = await Promise.all([
    prisma.contribution.count({
      where: { collectedById: agentId, collectionDate: day, status: "COLLECTED" },
    }),
    prisma.contribution.count({
      where: { collectedById: agentId, collectionDate: day, status: "MISSED" },
    }),
    prisma.contribution.count({
      where: { collectedById: agentId, collectionDate: day },
    }),
  ]);
  return { collected, missed, visited };
}

/**
 * Customer ids assigned to this agent that have NO Contribution row for the
 * given date yet — i.e. "not visited today". Computed as a set difference
 * rather than a stored flag, since "visited" is fully derived from whether a
 * row exists.
 */
export async function listCustomerIdsNotVisited(agentId: string, date: Date) {
  const day = toDateOnly(date);
  const [allActiveCustomers, visitedToday] = await Promise.all([
    prisma.customerProfile.findMany({
      where: { assignedAgentId: agentId, user: { isActive: true } },
      select: { id: true, customerCode: true, user: { select: { name: true, phone: true } } },
    }),
    prisma.contribution.findMany({
      where: { collectedById: agentId, collectionDate: day },
      select: { customerProfileId: true },
    }),
  ]);
  const visitedIds = new Set(visitedToday.map((c) => c.customerProfileId));
  return allActiveCustomers.filter((customer) => !visitedIds.has(customer.id));
}

/**
 * Sum of the outstanding (unresolved missed-day) amount owed across an
 * agent's ACTIVE plans — "Outstanding collections" on the Agent Collection
 * Summary. Defined as: for each active plan, (number of MISSED days so far)
 * × dailyAmount, summed across all the agent's active plans. A missed day
 * remains "outstanding" until the customer eventually pays extra days to
 * make up the shortfall (paid-day-based maturity — see
 * contribution-plan.service.ts).
 */
export async function sumOutstandingForAgent(agentId: string): Promise<number> {
  const activePlans = await prisma.contributionPlan.findMany({
    where: { status: "ACTIVE", customerProfile: { assignedAgentId: agentId } },
    select: { id: true, dailyAmount: true },
  });
  if (activePlans.length === 0) return 0;

  const missedCounts = await prisma.contribution.groupBy({
    by: ["contributionPlanId"],
    where: { contributionPlanId: { in: activePlans.map((p) => p.id) }, status: "MISSED" },
    _count: { _all: true },
  });
  const missedByPlan = new Map(missedCounts.map((row) => [row.contributionPlanId, row._count._all]));

  return activePlans.reduce((total, plan) => {
    const missedDays = missedByPlan.get(plan.id) ?? 0;
    return total + missedDays * Number(plan.dailyAmount);
  }, 0);
}

/** Recent contribution rows across an agent's customers, for an activity feed. */
export async function listRecentContributionsByAgent(agentId: string, limit = 10) {
  return prisma.contribution.findMany({
    where: { collectedById: agentId },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { customerProfile: { include: { user: { select: { name: true } } } } },
  });
}

/** System-wide recent contribution rows, for the Admin Dashboard activity feed. */
export async function listRecentContributionsSystemWide(limit = 10) {
  return prisma.contribution.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      customerProfile: { include: { user: { select: { name: true } } } },
      collectedBy: { select: { name: true } },
    },
  });
}

/** System-wide sum of COLLECTED amounts within a date range — Admin Dashboard totals. */
export async function sumCollectedSystemWide(range: { start: Date; end: Date }): Promise<number> {
  const result = await prisma.contribution.aggregate({
    where: {
      status: "COLLECTED",
      collectionDate: { gte: toDateOnly(range.start), lte: toDateOnly(range.end) },
    },
    _sum: { amount: true },
  });
  return Number(result._sum.amount ?? 0);
}

/** System-wide count of MISSED rows for one specific date — Admin Dashboard "Missed Payments Today". */
export async function countMissedSystemWide(date: Date): Promise<number> {
  return prisma.contribution.count({
    where: { collectionDate: toDateOnly(date), status: "MISSED" },
  });
}

export interface ContributionReportOptions {
  start: Date;
  end: Date;
  agentId?: string;
  customerProfileId?: string;
  /** Free-text match against the customer's name or customer code — an
   * alternative to `customerProfileId` for the Reports page's "Customer"
   * scope, where the Admin types a name/code rather than picking from a
   * pre-resolved id. */
  customerSearch?: string;
}

/**
 * Raw contribution rows for a date range, optionally scoped to a single
 * agent or customer — the shared data source for the Daily/Weekly/Monthly/
 * Agent/Customer report views (each view just picks a different range +
 * scope over the same query).
 */
export async function listContributionsForReport(options: ContributionReportOptions) {
  return prisma.contribution.findMany({
    where: {
      collectionDate: { gte: toDateOnly(options.start), lte: toDateOnly(options.end) },
      ...(options.agentId ? { collectedById: options.agentId } : {}),
      ...(options.customerProfileId ? { customerProfileId: options.customerProfileId } : {}),
      ...(options.customerSearch
        ? {
            customerProfile: {
              OR: [
                { customerCode: { contains: options.customerSearch, mode: "insensitive" } },
                { user: { name: { contains: options.customerSearch, mode: "insensitive" } } },
              ],
            },
          }
        : {}),
    },
    include: {
      customerProfile: { include: { user: { select: { name: true } } } },
      collectedBy: { select: { name: true } },
    },
    orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }],
  });
}
