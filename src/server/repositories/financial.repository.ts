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
      COALESCE((SELECT SUM(c.amount) FROM contributions c JOIN contribution_plans p ON p.id = c."contributionPlanId" WHERE c.status = 'COLLECTED' AND p.status = 'ACTIVE'), 0) AS active,
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

/** Net customer amount personally paid out by one Agent on the Lagos business date. */
export async function getPaidOutByAgentToday(agentId: string): Promise<number> {
  const result = await prisma.payout.aggregate({
    where: {
      approvedById: agentId,
      payoutDate: today(),
    },
    _sum: { customerAmount: true },
  });

  return Number(result._sum.customerAmount ?? 0);
}
