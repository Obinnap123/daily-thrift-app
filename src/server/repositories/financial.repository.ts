import { prisma } from "@/lib/prisma";

export async function getFinancialOverview() {
  const [row] = await prisma.$queryRaw<Array<{
    lifetime: unknown;
    active: unknown;
    paid: unknown;
    commission: unknown;
  }>>`
    SELECT
      COALESCE((SELECT SUM(c.amount) FROM contributions c WHERE c.status = 'COLLECTED'), 0) AS lifetime,
      COALESCE((SELECT SUM(c.amount) FROM contributions c JOIN contribution_plans p ON p.id = c."contributionPlanId" WHERE c.status = 'COLLECTED' AND p.status = 'ACTIVE'), 0) AS active,
      COALESCE((SELECT SUM(p."customerAmount") FROM payouts p), 0) AS paid,
      COALESCE((SELECT SUM(p."commissionAmount") FROM payouts p), 0) AS commission
  `;
  return {
    lifetimeCollections: Number(row?.lifetime ?? 0),
    activeSavings: Number(row?.active ?? 0),
    paidToCustomers: Number(row?.paid ?? 0),
    commissionEarned: Number(row?.commission ?? 0),
  };
}
