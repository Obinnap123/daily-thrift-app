import { prisma } from "@/lib/prisma";
import { today } from "@/lib/date";
import { calculateAvailableBalance } from "@/lib/financial-metrics";

export async function getFinancialOverview() {
  const businessDate = today();
  const [summary, paidToday] = await Promise.all([
    prisma.businessFinancialSummary.findUniqueOrThrow({
      where: { id: "default" },
    }),
    prisma.payout.aggregate({
      where: { payoutDate: businessDate },
      _sum: { customerAmount: true },
    }),
  ]);

  const lifetimeCollections = Number(summary.lifetimeCollections);
  const grossSavingsClosedByPayouts = Number(summary.grossSavingsClosed);
  const paidOutToCustomersAllTime = Number(summary.paidOutToCustomers);

  return {
    lifetimeCollections,
    availableBalance: calculateAvailableBalance(
      lifetimeCollections,
      grossSavingsClosedByPayouts,
    ),
    activeSavings: calculateAvailableBalance(
      lifetimeCollections,
      grossSavingsClosedByPayouts,
    ),
    paidOutToday: Number(paidToday._sum.customerAmount ?? 0),
    paidOutToCustomersAllTime,
    commissionEarned: Number(summary.commissionEarned),
  };
}

/** Current customer portfolio balance, plus this Agent's own payouts today. */
export async function getAgentFinancialOverview(agentId: string) {
  const businessDate = today();
  const [row] = await prisma.$queryRaw<Array<{
    lifetimeCollections: unknown;
    grossClosed: unknown;
    paidOutToday: unknown;
  }>>`
    SELECT
      COALESCE((
        SELECT SUM(c.amount)
        FROM contributions c
        JOIN customer_profiles cp ON cp.id = c."customerProfileId"
        WHERE cp."assignedAgentId" = ${agentId} AND c.status = 'COLLECTED'
      ), 0) AS "lifetimeCollections",
      COALESCE((
        SELECT SUM(p."grossSavings")
        FROM payouts p
        JOIN customer_profiles cp ON cp.id = p."customerProfileId"
        WHERE cp."assignedAgentId" = ${agentId}
      ), 0) AS "grossClosed",
      COALESCE((
        SELECT SUM(p."customerAmount")
        FROM payouts p
        WHERE p."approvedById" = ${agentId} AND p."payoutDate" = ${businessDate}
      ), 0) AS "paidOutToday"
  `;

  return {
    customersSavingsBalance: calculateAvailableBalance(
      Number(row?.lifetimeCollections ?? 0),
      Number(row?.grossClosed ?? 0),
    ),
    paidOutToday: Number(row?.paidOutToday ?? 0),
  };
}
