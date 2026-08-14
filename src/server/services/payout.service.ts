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
}>> {
  const parsed = recordPayoutSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.");

  const { contributionPlanId, payoutMethod, payoutDate, note } = parsed.data;
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

      const plan = await tx.contributionPlan.findUnique({ where: { id: contributionPlanId } });
      if (!plan) return { success: false as const, error: "Savings plan not found." };
      if (plan.status !== "ACTIVE") {
        return { success: false as const, error: plan.status === "PAID_OUT"
          ? "This customer has already been paid out for this savings period."
          : "This savings period is not available for payout." };
      }

      const [contributions, allocations, settings] = await Promise.all([
        tx.contribution.findMany({
          where: { contributionPlanId, status: "COLLECTED" },
          select: { amount: true },
        }),
        tx.contributionAllocation.findMany({
          where: { contributionPlanId },
          orderBy: { coverageDate: "desc" },
          select: { coverageDate: true },
        }),
        tx.businessSettings.upsert({
          where: { id: "default" },
          create: { id: "default" },
          update: {},
        }),
      ]);

      if (allocations.length < settings.minimumPayoutSlots) {
        return { success: false as const, error: `At least ${settings.minimumPayoutSlots} fully funded days are required before payout.` };
      }

      const grossSavings = contributions.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
      const commissionAmount = Number(plan.dailyAmount) * settings.commissionDays;
      const customerAmount = grossSavings - commissionAmount;
      if (customerAmount <= 0) return { success: false as const, error: "The saved balance is not enough to cover the payout commission." };

      const lastCoveredDate = allocations[0]?.coverageDate ?? null;
      await tx.contributionPlan.update({
        where: { id: contributionPlanId },
        data: { status: "PAID_OUT", endedAt: effectivePayoutDate, creditBalance: 0 },
      });
      const payout = await tx.payout.create({
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
          payoutDate: effectivePayoutDate,
          approvedById: processedById,
          receiptNumber,
          note: note || null,
        },
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
          grossSavings,
          commissionAmount,
          customerAmount,
          payoutMethod,
          payoutDate: effectivePayoutDate.toISOString().slice(0, 10),
        },
      }, audit);
      return { success: true as const, payout, grossSavings, commissionAmount, customerAmount };
    });

    if (!result.success) return fail(result.error);
    return ok({
      payoutId: result.payout.id,
      receiptNumber,
      grossSavings: result.grossSavings,
      commissionAmount: result.commissionAmount,
      customerAmount: result.customerAmount,
    });
  } catch (error) {
    if (isUniqueConstraintConflict(error)) {
      return fail("A payout has already been recorded for this savings period.");
    }
    throw error;
  }
}
