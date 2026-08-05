import "server-only";
import { prisma } from "@/lib/prisma";
import { buildTrackingSheets } from "@/lib/tracking";
export { buildTrackingSheets } from "@/lib/tracking";

export async function getTrackingData(customerProfileId: string) {
  const plans = await prisma.contributionPlan.findMany({
    where: { customerProfileId },
    orderBy: { startDate: "desc" },
    include: { allocations: { orderBy: { coverageDate: "asc" } }, payout: true },
  });
  return plans.map((plan) => ({
    plan,
    fullSlots: plan.allocations.length,
    credit: Number(plan.creditBalance),
    sheets: buildTrackingSheets(
      plan.startDate,
      plan.allocations.map((a) => a.coverageDate),
      plan.status === "PAID_OUT"
    ),
  }));
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
