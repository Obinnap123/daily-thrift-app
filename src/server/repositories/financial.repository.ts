import { prisma } from "@/lib/prisma";
import { today } from "@/lib/date";
import { calculateAvailableBalance } from "@/lib/financial-metrics";

export async function getFinancialOverview() {
  const businessDate = today();
  const [row] = await prisma.$queryRaw<Array<{
    lifetime: unknown;
    active: unknown;
    grossClosed: unknown;
    paid: unknown;
    paidToday: unknown;
    commission: unknown;
  }>>`
    SELECT
      COALESCE((SELECT SUM(c.amount) FROM contributions c WHERE c.status = 'COLLECTED'), 0) AS lifetime,
      COALESCE((SELECT SUM(c.amount) FROM contributions c WHERE c.status = 'COLLECTED'), 0)
        - COALESCE((SELECT SUM(p."grossSavings") FROM payouts p), 0) AS active,
      COALESCE((SELECT SUM(p."grossSavings") FROM payouts p), 0) AS "grossClosed",
      COALESCE((SELECT SUM(p."customerAmount") FROM payouts p), 0) AS paid,
      COALESCE((SELECT SUM(p."customerAmount") FROM payouts p WHERE p."payoutDate" = ${businessDate}), 0) AS "paidToday",
      COALESCE((SELECT SUM(p."commissionAmount") FROM payouts p), 0) AS commission
  `;

  const lifetimeCollections = Number(row?.lifetime ?? 0);
  const grossSavingsClosedByPayouts = Number(row?.grossClosed ?? 0);
  const paidOutToCustomersAllTime = Number(row?.paid ?? 0);

  return {
    lifetimeCollections,
    availableBalance: calculateAvailableBalance(
      lifetimeCollections,
      grossSavingsClosedByPayouts,
    ),
    activeSavings: Number(row?.active ?? 0),
    paidOutToday: Number(row?.paidToday ?? 0),
    paidOutToCustomersAllTime,
    commissionEarned: Number(row?.commission ?? 0),
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
