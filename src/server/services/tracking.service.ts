import "server-only";
import { prisma } from "@/lib/prisma";
import { buildTrackingSheets } from "@/lib/tracking";
export { buildTrackingSheets } from "@/lib/tracking";

export async function getTrackingData(customerProfileId: string) {
  const plans = await prisma.contributionPlan.findMany({
    where: { customerProfileId },
    orderBy: { startDate: "desc" },
    include: {
      allocations: { orderBy: { coverageDate: "asc" }, include: { payoutMonth: true } },
      payouts: { orderBy: { payoutDate: "desc" }, include: { months: true } },
      monthlyRates: { orderBy: { monthStart: "asc" } },
    },
  });
  return plans.map((plan) => {
    const monthTotals = new Map<string, number>();
    const settledTotals = new Map<string, number>();
    for (const allocation of plan.allocations) {
      const key = allocation.coverageDate.toISOString().slice(0, 7);
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + Number(allocation.amount));
    }
    for (const payout of plan.payouts) for (const month of payout.months) {
      const key = month.monthStart.toISOString().slice(0, 7);
      settledTotals.set(key, (settledTotals.get(key) ?? 0) + Number(month.grossSavings));
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + Number(month.creditAmount));
    }
    if (plan.nextCoverageDate && Number(plan.creditBalance) > 0) {
      const key = plan.nextCoverageDate.toISOString().slice(0, 7);
      monthTotals.set(key, (monthTotals.get(key) ?? 0) + Number(plan.creditBalance));
    }
    return {
    plan,
    fullSlots: plan.allocations.length,
    credit: Number(plan.creditBalance),
    sheets: buildTrackingSheets(
      plan.startDate,
      plan.allocations.map((a) => a.coverageDate),
      plan.status === "PAID_OUT",
      { endedAt: plan.payouts[0]?.lastCoveredDate ?? plan.endedAt },
    ),
    monthlyRates: plan.monthlyRates,
    paidMonthKeys: new Set([...settledTotals].filter(([key, total]) => total >= (monthTotals.get(key) ?? 0) - 0.005).map(([key]) => key)),
    partialMonthBalances: new Map([...settledTotals].filter(([key, total]) => total < (monthTotals.get(key) ?? 0) - 0.005)
      .map(([key, total]) => [key, Math.round(((monthTotals.get(key) ?? 0) - total) * 100) / 100])),
  };
  });
}

export async function listCurrentTrackingRows(agentId?: string) {
  const plans = await prisma.contributionPlan.findMany({
    where: { status: "ACTIVE", ...(agentId ? { customerProfile: { assignedAgentId: agentId } } : {}) },
    include: {
      allocations: { orderBy: { coverageDate: "asc" } },
      customerProfile: { include: { user: { select: { name: true, phone: true } }, assignedAgent: { select: { name: true } } } },
    },
    orderBy: { customerProfile: { user: { name: "asc" } } },
  });
  return plans.map((plan) => {
    const sheets = buildTrackingSheets(plan.startDate, plan.allocations.map((row) => row.coverageDate), false);
    return { planId: plan.id, customerProfileId: plan.customerProfileId, customerName: plan.customerProfile.user.name, phone: plan.customerProfile.user.phone, agentName: plan.customerProfile.assignedAgent.name, dailyAmount: Number(plan.dailyAmount), credit: Number(plan.creditBalance), fullSlots: plan.allocations.length, sheet: sheets.at(-1)!, sheetCount: sheets.length };
  });
}

export type CurrentTrackingRow = Awaited<ReturnType<typeof listCurrentTrackingRows>>[number];
