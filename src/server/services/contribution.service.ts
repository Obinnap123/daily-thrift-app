/**
 * Contribution ("Daily Contribution Recording" + "Quick Pay") business logic.
 * ----------------------------------------------------------------------------
 * Two write paths now live here:
 *
 *  - recordContribution(): the original path used by the inline "Today's
 *    Collections" form and the dashboard "not yet recorded today" widgets.
 *    Handles both COLLECTED and MISSED outcomes. Always uses the SERVER's
 *    current date (`today()`), never a date supplied by the client — an
 *    agent cannot backdate or future-date a collection through this form,
 *    which keeps "today's collections" numbers on every dashboard
 *    trustworthy. Every COLLECTED row gets an auto-generated receipt
 *    number, same as Quick Pay, so payment history/receipts stay
 *    consistent no matter which screen was used to record the payment.
 *
 *  - recordQuickPay(): the "Quick Pay" modal path (Admin + Agent
 *    dashboards, and the Customer Tracking page). Always records a
 *    COLLECTED payment (Quick Pay never records a MISSED day — that stays
 *    on the Today's Collections screen). Adds: an explicit payment method,
 *    an editable amount, a receipt number, and — Admin-only — the ability
 *    to override the same-day duplicate-payment check and (still
 *    Admin-only) to backdate the payment date. An Agent's request is
 *    always pinned to today() and can never set isOverride, regardless of
 *    what the client sends — re-checked here, not just trusted from the
 *    caller's Server Action authorization layer.
 *
 * Both paths funnel through the same refreshPlanCompletionStatus() call
 * after creating the row, so contribution-plan.service.ts remains the one
 * place that owns "what does completion mean" logic.
 */
import "server-only";
import { addDaysToDate, today, toDateOnly } from "@/lib/date";
import {
  recordContributionSchema,
  quickPaySchema,
  type RecordContributionInput,
  type QuickPayInput,
} from "@/validations/contribution";
import { generateContributionReceiptNumber } from "@/lib/receipt-number";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import type { Prisma } from "@/generated/prisma/client";
import { isUniqueConstraintConflict } from "@/lib/prisma-errors";
import {
  lockCustomerFinancialState,
  runFinancialTransaction,
} from "@/lib/financial-transaction";
import {
  createAuditLog,
  type AuditActorContext,
} from "@/server/services/audit.service";

type PlanForAllocation = {
  id: string;
  customerProfileId: string;
  dailyAmount: unknown;
  startDate: Date;
  nextCoverageDate: Date | null;
  creditBalance: unknown;
};

async function createNextActivePlan(
  tx: Prisma.TransactionClient,
  customerProfileId: string,
  previous: {
    dailyAmount: unknown;
    nextCoverageDate: Date | null;
  },
  collectionDate: Date,
) {
  const startDate = previous.nextCoverageDate ?? collectionDate;

  return tx.contributionPlan.create({
    data: {
      customerProfileId,
      dailyAmount: previous.dailyAmount as Prisma.Decimal,
      durationDays: 31,
      startDate,
      expectedMaturityDate: addDaysToDate(startDate, 30),
      nextCoverageDate: startDate,
    },
  });
}

async function allocateCollectedAmount(
  tx: Prisma.TransactionClient,
  plan: PlanForAllocation,
  contributionId: string,
  amount: number
) {
  const dailyAmount = Number(plan.dailyAmount);
  const available = Number(plan.creditBalance) + amount;
  const fullSlots = Math.floor((available + Number.EPSILON) / dailyAmount);
  const creditBalance = Number((available - fullSlots * dailyAmount).toFixed(2));
  const firstDate = plan.nextCoverageDate ?? plan.startDate;

  if (fullSlots > 0) {
    await tx.contributionAllocation.createMany({
      data: Array.from({ length: fullSlots }, (_, index) => ({
        contributionPlanId: plan.id,
        contributionId,
        coverageDate: addDaysToDate(firstDate, index),
        amount: dailyAmount,
      })),
    });
  }

  await tx.contributionPlan.update({
    where: { id: plan.id },
    data: {
      creditBalance,
      nextCoverageDate: addDaysToDate(firstDate, fullSlots),
      status: "ACTIVE",
    },
  });

  return { fullSlots, creditBalance };
}

export async function recordContribution(
  input: RecordContributionInput,
  collectedById: string,
  audit: AuditActorContext,
): Promise<ActionResult<{ contributionId: string }>> {
  const parsed = recordContributionSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { customerProfileId, status, amount, note } = parsed.data;

  const collectionDate = today();
  // Draw the receipt number BEFORE the transaction — nextval() on a
  // sequence is its own atomic operation (same reasoning as
  // generateReceiptNumber() in the Payout module). Only COLLECTED rows get
  // a receipt; a MISSED day has nothing to issue a receipt for.
  const receiptNumber = status === "COLLECTED" ? await generateContributionReceiptNumber() : null;

  try {
    const result = await runFinancialTransaction(async (tx) => {
      await lockCustomerFinancialState(tx, customerProfileId);
      let plan = await tx.contributionPlan.findFirst({
        where: { customerProfileId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      });
      if (!plan) {
        const previous = status === "COLLECTED"
          ? await tx.contributionPlan.findFirst({
              where: { customerProfileId },
              orderBy: { createdAt: "desc" },
            })
          : null;
        if (!previous) {
          return {
            success: false as const,
            error: "This customer has no active savings plan. Start a plan before recording contributions.",
          };
        }
        plan = await createNextActivePlan(tx, customerProfileId, previous, collectionDate);
      }

      const alreadyRecorded = await tx.contribution.findFirst({
        where: { contributionPlanId: plan.id, collectionDate, isOverride: false },
        select: { id: true },
      });
      if (alreadyRecorded) {
        return {
          success: false as const,
          error: "Today's collection has already been recorded for this customer.",
        };
      }

      const created = await tx.contribution.create({
        data: {
          contributionPlanId: plan.id,
          customerProfileId,
          collectedById,
          collectionDate,
          status,
          amount: status === "COLLECTED" ? amount : null,
          note: note || null,
          receiptNumber,
        },
      });
      if (status === "COLLECTED") {
        await allocateCollectedAmount(tx, plan, created.id, Number(amount));
      }
      await createAuditLog(tx, {
        actorId: audit.actorId,
        actorRole: audit.actorRole,
        action: status === "COLLECTED" ? "CONTRIBUTION_RECORDED" : "MISSED_VISIT_RECORDED",
        outcome: "SUCCESS",
        entityType: "Contribution",
        entityId: created.id,
        summary: "Daily collection outcome recorded.",
        metadata: {
          customerProfileId,
          status,
          amount: status === "COLLECTED" ? Number(amount) : null,
          receiptNumber,
          collectionDate: collectionDate.toISOString().slice(0, 10),
        },
      }, audit);
      return { success: true as const, contributionId: created.id };
    });
    if (!result.success) return fail(result.error);
    return ok({ contributionId: result.contributionId });
  } catch (error) {
    if (isUniqueConstraintConflict(error)) {
      return fail("Today's collection has already been recorded for this customer.");
    }
    throw error;
  }
}

/**
 * Record a payment via the "Quick Pay" modal. Always COLLECTED.
 *
 * @param actorIsAdmin Re-verified by the caller (Server Action) from the
 *   session, then passed in here — this function does NOT call
 *   requireRole() itself (that's the Server Action's job), but it DOES
 *   gate every Admin-only capability (override, backdating) on this flag
 *   rather than trusting `input.isOverride` / `input.paymentDate` blindly.
 */
export async function recordQuickPay(
  input: QuickPayInput,
  collectedById: string,
  actorIsAdmin: boolean,
  audit: AuditActorContext,
): Promise<ActionResult<{ contributionId: string; receiptNumber: string }>> {
  const parsed = quickPaySchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { customerProfileId, amount, paymentMethod, note } = parsed.data;

  // Admin-only capabilities: backdating the payment date, and overriding
  // the duplicate-payment check. An Agent's request is pinned back to
  // today() / isOverride = false here, regardless of what was submitted —
  // never trust the client (or even the Server Action layer alone) for a
  // privilege this sensitive.
  const collectionDate = actorIsAdmin && parsed.data.paymentDate
    ? toDateOnly(parsed.data.paymentDate)
    : today();
  const isOverride = actorIsAdmin ? parsed.data.isOverride : false;
  const overrideReason = isOverride ? parsed.data.overrideReason || null : null;
  if (collectionDate > today()) return fail("A payment cannot be dated in the future.");

  // Draw the receipt number BEFORE the transaction — nextval() on a
  // sequence is its own atomic operation.
  const receiptNumber = await generateContributionReceiptNumber();

  try {
    const result = await runFinancialTransaction(async (tx) => {
      await lockCustomerFinancialState(tx, customerProfileId);
      let plan = await tx.contributionPlan.findFirst({
        where: { customerProfileId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
      });
      if (!plan) {
        const previous = await tx.contributionPlan.findFirst({
          where: { customerProfileId },
          orderBy: { createdAt: "desc" },
        });
        if (!previous) {
          return {
            success: false as const,
            error: "This customer has no savings plan. Start a plan before recording a payment.",
          };
        }
        plan = await createNextActivePlan(tx, customerProfileId, previous, collectionDate);
      }

      const created = await tx.contribution.create({
        data: {
          contributionPlanId: plan.id,
          customerProfileId,
          collectedById,
          collectionDate,
          status: "COLLECTED",
          amount,
          note: note || null,
          paymentMethod,
          receiptNumber,
          isOverride,
          overriddenById: isOverride ? collectedById : null,
          overrideReason,
        },
      });
      const allocation = await allocateCollectedAmount(tx, plan, created.id, amount);
      await createAuditLog(tx, {
        actorId: audit.actorId,
        actorRole: audit.actorRole,
        action: "QUICK_PAY",
        outcome: "SUCCESS",
        entityType: "Contribution",
        entityId: created.id,
        summary: `Payment recorded with receipt ${receiptNumber}.`,
        metadata: {
          customerProfileId,
          amount,
          receiptNumber,
          paymentMethod,
          collectionDate: collectionDate.toISOString().slice(0, 10),
          isOverride,
        },
      }, audit);
      return { success: true as const, contribution: created, allocation };
    });
    if (!result.success) return fail(result.error);

    return ok({
      contributionId: result.contribution.id,
      receiptNumber,
      slotsFunded: result.allocation.fullSlots,
      creditBalance: result.allocation.creditBalance,
    });
  } catch (error) {
    if (isUniqueConstraintConflict(error)) {
      return fail("A payment has already been recorded for this customer today. An Admin may use an override when appropriate.");
    }
    throw error;
  }
}
