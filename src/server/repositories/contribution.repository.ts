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
import { toDateOnly, today, addDaysToDate, dateKey, weekRange, monthRange } from "@/lib/date";
import { format } from "date-fns";

/**
 * The NORMAL (non-override) Contribution row for a given plan + day, if one
 * was recorded — this is what the duplicate-payment check queries. Uses
 * findFirst rather than findUnique: since the Quick Pay migration, the
 * database's uniqueness guarantee for (contributionPlanId, collectionDate)
 * is a PARTIAL unique index scoped to isOverride = false rows (see
 * migration 20260727130000), so Prisma no longer exposes this pair as a
 * plain compound unique key — but filtering isOverride: false here means
 * at most one such row can ever exist per plan+day regardless.
 */
export async function findContributionForPlanAndDate(
  contributionPlanId: string,
  date: Date
) {
  return prisma.contribution.findFirst({
    where: {
      contributionPlanId,
      collectionDate: toDateOnly(date),
      isOverride: false,
    },
  });
}

/**
 * ALL Contribution rows (normal and Admin-approved overrides) for a given
 * plan + day — used by the Quick Pay override flow to show an Admin what
 * already exists before they confirm an override.
 */
export async function listContributionsForPlanAndDate(contributionPlanId: string, date: Date) {
  return prisma.contribution.findMany({
    where: { contributionPlanId, collectionDate: toDateOnly(date) },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Full payment history for a customer ACROSS every savings cycle they've
 * ever had (not just their current plan) — the "digital passbook" / Payment
 * History data source for the Customer Tracking Dashboard. Newest first.
 */
export async function listContributionsForCustomer(customerProfileId: string) {
  return prisma.contribution.findMany({
    where: { customerProfileId },
    include: {
      collectedBy: { select: { id: true, name: true } },
      overriddenBy: { select: { id: true, name: true } },
      contributionPlan: { select: { id: true, dailyAmount: true, startDate: true, status: true } },
    },
    orderBy: [{ collectionDate: "desc" }, { createdAt: "desc" }],
  });
}

/** Look up a single Contribution by its printed receipt number — for the printable receipt page. */
export async function findContributionByReceiptNumber(receiptNumber: string) {
  return prisma.contribution.findUnique({
    where: { receiptNumber },
    include: {
      customerProfile: { include: { user: { select: { name: true, phone: true } } } },
      collectedBy: { select: { id: true, name: true } },
      overriddenBy: { select: { id: true, name: true } },
      contributionPlan: { select: { id: true, dailyAmount: true } },
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

/** One calendar day's aggregated collection activity, for the 31-Day Tracker. */
export interface DailyTrackingDay {
  /** yyyy-MM-dd — stable key for React lists and tooltips. */
  date: string;
  /** Short display label, e.g. "27 Jul". */
  label: string;
  /** Day-of-month only, e.g. "27" — shown inside the tracker cell. */
  dayOfMonth: string;
  /** Sum of COLLECTED amounts recorded on this day. */
  totalAmount: number;
  /** Number of COLLECTED rows recorded on this day. */
  collectedCount: number;
  /** Number of MISSED rows recorded on this day. */
  missedCount: number;
}

export interface DashboardContributionSummary {
  totalToday: number;
  totalWeek: number;
  totalMonth: number;
  collectedToday: number;
  missedToday: number;
  visitedToday: number;
  trackingSeries: DailyTrackingDay[];
}

/** One grouped query powers every date-based dashboard metric and the
 * rolling activity grid, avoiding several competing pool requests. */
export async function getDashboardContributionSummary(agentId?: string): Promise<DashboardContributionSummary> {
  const end = today();
  const start = addDaysToDate(end, -30);
  const weekStart = weekRange(end).start;
  const monthStart = monthRange(end).start;
  const rows = await prisma.contribution.groupBy({
    by: ["collectionDate", "status"],
    where: {
      collectionDate: { gte: start, lte: end },
      ...(agentId ? { collectedById: agentId } : {}),
    },
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { collectionDate: "asc" },
  });

  const todayKey = dateKey(end);
  const buckets = new Map<string, { totalAmount: number; collectedCount: number; missedCount: number }>();
  let totalToday = 0;
  let totalWeek = 0;
  let totalMonth = 0;
  let collectedToday = 0;
  let missedToday = 0;

  for (const row of rows) {
    const key = dateKey(row.collectionDate);
    const count = row._count._all;
    const amount = row.status === "COLLECTED" ? Number(row._sum.amount ?? 0) : 0;
    const bucket = buckets.get(key) ?? { totalAmount: 0, collectedCount: 0, missedCount: 0 };
    bucket.totalAmount += amount;
    if (row.status === "COLLECTED") bucket.collectedCount += count;
    else bucket.missedCount += count;
    buckets.set(key, bucket);

    if (row.status === "COLLECTED") {
      if (key === todayKey) { totalToday += amount; collectedToday += count; }
      if (row.collectionDate >= weekStart) totalWeek += amount;
      if (row.collectionDate >= monthStart) totalMonth += amount;
    } else if (key === todayKey) {
      missedToday += count;
    }
  }

  const trackingSeries = Array.from({ length: 31 }, (_, index): DailyTrackingDay => {
    const date = addDaysToDate(start, index);
    const key = dateKey(date);
    const bucket = buckets.get(key) ?? { totalAmount: 0, collectedCount: 0, missedCount: 0 };
    return {
      date: key,
      label: new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date),
      dayOfMonth: String(date.getUTCDate()),
      ...bucket,
    };
  });

  return {
    totalToday,
    totalWeek,
    totalMonth,
    collectedToday,
    missedToday,
    visitedToday: collectedToday + missedToday,
    trackingSeries,
  };
}

/**
 * A rolling 31-day (default) series of daily collection activity, ending
 * today — the shared data source for the "31-Day Tracking" grid shown on
 * both the Admin Dashboard (system-wide, no `agentId`) and the Agent
 * Dashboard (scoped to `agentId`). One query fetches every Contribution row
 * in the window, then the rows are bucketed by calendar day in memory so
 * every day in the range is represented (including days with zero activity)
 * rather than only the days that happen to have a row.
 */
export async function getDailyTrackingSeries(
  options: { agentId?: string; days?: number } = {}
): Promise<DailyTrackingDay[]> {
  const days = options.days ?? 31;
  const end = today();
  const start = addDaysToDate(end, -(days - 1));

  const rows = await prisma.contribution.findMany({
    where: {
      collectionDate: { gte: start, lte: end },
      ...(options.agentId ? { collectedById: options.agentId } : {}),
    },
    select: { collectionDate: true, status: true, amount: true },
  });

  const byDateKey = new Map<
    string,
    { totalAmount: number; collectedCount: number; missedCount: number }
  >();
  for (const row of rows) {
    const key = format(row.collectionDate, "yyyy-MM-dd");
    const bucket = byDateKey.get(key) ?? { totalAmount: 0, collectedCount: 0, missedCount: 0 };
    if (row.status === "COLLECTED") {
      bucket.collectedCount += 1;
      bucket.totalAmount += Number(row.amount ?? 0);
    } else {
      bucket.missedCount += 1;
    }
    byDateKey.set(key, bucket);
  }

  const series: DailyTrackingDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDaysToDate(start, i);
    const key = format(date, "yyyy-MM-dd");
    const bucket = byDateKey.get(key) ?? { totalAmount: 0, collectedCount: 0, missedCount: 0 };
    series.push({
      date: key,
      label: format(date, "d MMM"),
      dayOfMonth: format(date, "d"),
      totalAmount: bucket.totalAmount,
      collectedCount: bucket.collectedCount,
      missedCount: bucket.missedCount,
    });
  }
  return series;
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
