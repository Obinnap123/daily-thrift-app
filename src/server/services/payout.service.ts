import "server-only";
import { prisma } from "@/lib/prisma";
import { toDateOnly, today } from "@/lib/date";
import { generateReceiptNumber } from "@/lib/receipt-number";
import { recordPayoutSchema, type RecordPayoutInput } from "@/validations/payout";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import {
  lockCustomerFinancialState,
  runFinancialTransaction,
} from "@/lib/financial-transaction";
import { isUniqueConstraintConflict } from "@/lib/prisma-errors";
import {
  createAuditLog,
  type AuditActorContext,
} from "@/server/services/audit.service";
import {
  buildPayoutMonthOptions,
  calculatePayout,
} from "@/lib/payout-selection";

export async function recordPayout(
  input: RecordPayoutInput,
  processedById: string,
  audit: AuditActorContext,
): Promise<ActionResult<{
  payoutId: string;
  receiptNumber: string;
  grossSavings: number;
  commissionAmount: number;
  customerAmount: number;
  remainingBalance: number;
}>> {
  const parsed = recordPayoutSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.");

  const { contributionPlanId, clientRequestId, mode, requestedMonths, payoutMethod, payoutDate, note } = parsed.data;
  if (mode === "PARTIAL" && (!requestedMonths.length || new Set(requestedMonths.map((row) => row.month)).size !== requestedMonths.length)) {
    return fail("Choose each payout month once and enter what the customer receives.");
  }
  const closePeriod = mode === "FULL";
  const effectivePayoutDate = toDateOnly(payoutDate);
  if (effectivePayoutDate > today()) return fail("A payout cannot be dated in the future.");

  // This read discovers the stable customer key needed for the advisory lock.
  // Every balance/status value is re-read after the lock inside the transaction.
  const planIdentity = await prisma.contributionPlan.findUnique({
    where: { id: contributionPlanId },
    select: { customerProfileId: true },
  });
  if (!planIdentity) return fail("Savings plan not found.");

  const receiptNumber = await generateReceiptNumber();
  try {
    const result = await runFinancialTransaction(async (tx) => {
      await lockCustomerFinancialState(tx, planIdentity.customerProfileId);

      const previous = await tx.payout.findUnique({ where: { clientRequestId } });
      if (previous) {
        if (previous.contributionPlanId !== contributionPlanId || previous.approvedById !== processedById) {
          return { success: false as const, error: "This payout request has already been used." };
        }
        return { success: true as const, payout: previous, grossSavings: Number(previous.grossSavings), commissionAmount: Number(previous.commissionAmount), customerAmount: Number(previous.customerAmount) };
      }

      const plan = await tx.contributionPlan.findUnique({ where: { id: contributionPlanId } });
      if (!plan) return { success: false as const, error: "Savings plan not found." };
      if (plan.status !== "ACTIVE") {
        return { success: false as const, error: plan.status === "PAID_OUT"
          ? "This customer has already been paid out for this savings period."
          : "This savings period is not available for payout." };
      }

      const [allocations, monthlyRates, priorPayoutMonths, settings] = await Promise.all([
        tx.contributionAllocation.findMany({
          where: { contributionPlanId },
          orderBy: { coverageDate: "asc" },
          select: { id: true, coverageDate: true, amount: true },
        }),
        tx.contributionMonthRate.findMany({ where: { contributionPlanId } }),
        tx.payoutMonth.findMany({
          where: { payout: { contributionPlanId } },
          select: { monthStart: true, grossSavings: true, creditAmount: true, commissionAmount: true },
        }),
        tx.businessSettings.upsert({
          where: { id: "default" },
          create: { id: "default" },
          update: {},
        }),
      ]);

      const availableMonths = buildPayoutMonthOptions({
        allocations,
        rates: monthlyRates,
        planDailyAmount: plan.dailyAmount,
        creditBalance: plan.creditBalance,
        nextCoverageDate: plan.nextCoverageDate,
        priorPayoutMonths,
      });
      const selected = calculatePayout({ months: availableMonths, mode, requestedMonths, commissionDays: settings.commissionDays });
      if (mode === "PARTIAL" && selected.breakdown.length !== requestedMonths.length) {
        return { success: false as const, error: "One or more selected months no longer have an unpaid balance. Refresh and try again." };
      }
      if (!selected.breakdown.length) return { success: false as const, error: "There is no savings balance available for payout." };
      if (allocations.length < settings.minimumPayoutSlots) {
        return { success: false as const, error: `At least ${settings.minimumPayoutSlots} fully funded days are required before payout.` };
      }
      if (selected.breakdown.some((month) => !Number.isFinite(month.customerAmount) || month.customerAmount <= 0 || month.customerAmount > month.maxCustomerAmount || month.remainingBalance < 0)) {
        return { success: false as const, error: "Check each month’s amount. It must be more than zero and cannot exceed what the customer can receive after that month’s commission." };
      }
      if (mode === "PARTIAL" && selected.remainingBalance <= 0) {
        return { success: false as const, error: "This would pay out all remaining savings. Choose Full payout to close the period." };
      }
      const lastCoveredDate = closePeriod ? allocations.at(-1)?.coverageDate ?? null : null;
      const creditConsumed = selected.breakdown.reduce((sum, month) => sum + month.creditConsumed, 0);
      const payout = await tx.payout.create({
        data: {
          contributionPlanId,
          customerProfileId: plan.customerProfileId,
          totalSavings: selected.grossSavings,
          grossSavings: selected.grossSavings,
          commissionAmount: selected.commissionAmount,
          customerAmount: selected.customerAmount,
          commissionDays: settings.commissionDays,
          minimumPayoutSlots: settings.minimumPayoutSlots,
          lastCoveredDate,
          scope: mode,
          remainingBalance: selected.remainingBalance,
          payoutMethod,
          payoutDate: effectivePayoutDate,
          approvedById: processedById,
          receiptNumber,
          clientRequestId,
          note: note || null,
        },
      });

      for (const month of selected.breakdown) {
        await tx.payoutMonth.create({
          data: {
            payoutId: payout.id,
            monthStart: month.monthStart,
            dailyAmount: month.dailyAmount,
            grossSavings: month.grossSavings,
            commissionAmount: month.commissionAmount,
            customerAmount: month.customerAmount,
            fundedSlots: month.fundedSlots,
            creditAmount: month.creditConsumed,
          },
        });
      }

      await tx.contributionPlan.update({
        where: { id: contributionPlanId },
        data: closePeriod
          ? { status: "PAID_OUT", endedAt: effectivePayoutDate, creditBalance: 0 }
          : creditConsumed > 0
            ? { creditBalance: Math.round((Number(plan.creditBalance) - creditConsumed) * 100) / 100 }
            : {},
      });
      await createAuditLog(tx, {
        actorId: audit.actorId,
        actorRole: audit.actorRole,
        action: "PAYOUT_COMPLETED",
        outcome: "SUCCESS",
        entityType: "Payout",
        entityId: payout.id,
        summary: "Customer payout completed.",
        metadata: {
          customerProfileId: plan.customerProfileId,
          contributionPlanId,
          receiptNumber,
          scope: mode,
          selectedMonths: selected.breakdown.map((month) => month.key).join(","),
          grossSavings: selected.grossSavings,
          commissionAmount: selected.commissionAmount,
          customerAmount: selected.customerAmount,
          remainingBalance: selected.remainingBalance,
          payoutMethod,
          payoutDate: effectivePayoutDate.toISOString().slice(0, 10),
        },
      }, audit);
      return {
        success: true as const,
        payout,
        grossSavings: selected.grossSavings,
        commissionAmount: selected.commissionAmount,
        customerAmount: selected.customerAmount,
      };
    });

    if (!result.success) return fail(result.error);
    return ok({
      payoutId: result.payout.id,
      receiptNumber: result.payout.receiptNumber,
      grossSavings: result.grossSavings,
      commissionAmount: result.commissionAmount,
      customerAmount: result.customerAmount,
      remainingBalance: Number(result.payout.remainingBalance),
    });
  } catch (error) {
    if (isUniqueConstraintConflict(error)) {
      return fail("This payout could not be recorded because its receipt or selected savings already exist.");
    }
    throw error;
  }
}
