import "server-only";
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/date";
import { generateReceiptNumber } from "@/lib/receipt-number";
import { recordPayoutSchema, type RecordPayoutInput } from "@/validations/payout";
import { findPlanById } from "@/server/repositories/contribution-plan.repository";
import { findPayoutByPlanId } from "@/server/repositories/payout.repository";
import { getBusinessSettings } from "@/server/services/settings.service";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export async function recordPayout(
  input: RecordPayoutInput,
  processedById: string
): Promise<ActionResult<{
  payoutId: string;
  receiptNumber: string;
  grossSavings: number;
  commissionAmount: number;
  customerAmount: number;
}>> {
  const parsed = recordPayoutSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.");

  const { contributionPlanId, payoutMethod, payoutDate, note } = parsed.data;
  const plan = await findPlanById(contributionPlanId);
  if (!plan) return fail("Savings plan not found.");
  if (plan.status !== "ACTIVE") {
    return fail(plan.status === "PAID_OUT"
      ? "This customer has already been paid out for this savings period."
      : "This savings period is not available for payout.");
  }
  if (await findPayoutByPlanId(contributionPlanId)) {
    return fail("A payout has already been recorded for this savings period.");
  }

  const [contributions, allocations, settings] = await Promise.all([
    prisma.contribution.findMany({
      where: { contributionPlanId, status: "COLLECTED" },
      select: { amount: true },
    }),
    prisma.contributionAllocation.findMany({
      where: { contributionPlanId },
      orderBy: { coverageDate: "desc" },
      select: { coverageDate: true },
    }),
    getBusinessSettings(),
  ]);

  if (allocations.length < settings.minimumPayoutSlots) {
    return fail(`At least ${settings.minimumPayoutSlots} fully funded days are required before payout.`);
  }

  const grossSavings = contributions.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
  const commissionAmount = Number(plan.dailyAmount) * settings.commissionDays;
  const customerAmount = grossSavings - commissionAmount;
  if (customerAmount <= 0) return fail("The saved balance is not enough to cover the payout commission.");

  const receiptNumber = await generateReceiptNumber();
  const lastCoveredDate = allocations[0]?.coverageDate ?? null;
  const payout = await prisma.$transaction(async (tx) => {
    const closed = await tx.contributionPlan.updateMany({
      where: { id: contributionPlanId, status: "ACTIVE" },
      data: { status: "PAID_OUT", endedAt: toDateOnly(payoutDate), creditBalance: 0 },
    });
    if (closed.count !== 1) throw new Error("This savings period was already closed.");

    return tx.payout.create({
      data: {
        contributionPlanId,
        customerProfileId: plan.customerProfileId,
        totalSavings: grossSavings,
        grossSavings,
        commissionAmount,
        customerAmount,
        commissionDays: settings.commissionDays,
        minimumPayoutSlots: settings.minimumPayoutSlots,
        lastCoveredDate,
        payoutMethod,
        payoutDate: toDateOnly(payoutDate),
        approvedById: processedById,
        receiptNumber,
        note: note || null,
      },
    });
  }, { isolationLevel: "Serializable" });

  return ok({ payoutId: payout.id, receiptNumber, grossSavings, commissionAmount, customerAmount });
}
