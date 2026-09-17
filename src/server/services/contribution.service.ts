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
 *    to backdate the payment date. Additional same-day payments are allowed
 *    for both roles with explicit confirmation and an idempotency token.
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
import { calendarMonthKey, calendarMonthStart } from "@/lib/payout-selection";

type PlanForAllocation = {
  id: string;
  customerProfileId: string;
  dailyAmount: unknown;
  startDate: Date;
  nextCoverageDate: Date | null;
  creditBalance: unknown;
};

class MonthlyRateConflictError extends Error {}
class MonthlyRateRequiredError extends Error {}

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
      monthlyRates: {
        create: {
          monthStart: calendarMonthStart(startDate),
          dailyAmount: previous.dailyAmount as Prisma.Decimal,
        },
      },
    },
  });
}

async function allocateCollectedAmount(
  tx: Prisma.TransactionClient,
  plan: PlanForAllocation,
  contributionId: string,
  amount: number,
  requestedMonthlyRate?: number,
  requestedMonthlyRates: { month: string; dailyAmount: number }[] = [],
) {
  const firstDate = plan.nextCoverageDate ?? plan.startDate;
  const firstMonth = calendarMonthStart(firstDate);
  const suppliedRateByMonth = new Map(
    requestedMonthlyRates.map((rate) => [rate.month, rate.dailyAmount]),
  );
  if (requestedMonthlyRate) {
    suppliedRateByMonth.set(calendarMonthKey(firstMonth), requestedMonthlyRate);
  }

  const [storedRates, allocatedDates] = await Promise.all([
    tx.contributionMonthRate.findMany({
      where: { contributionPlanId: plan.id },
      orderBy: { monthStart: "asc" },
    }),
    tx.contributionAllocation.findMany({
      where: { contributionPlanId: plan.id },
      select: { coverageDate: true },
    }),
  ]);
  const lockedMonths = new Set(allocatedDates.map((row) => calendarMonthKey(row.coverageDate)));
  const rateByMonth = new Map(storedRates.map((row) => [calendarMonthKey(row.monthStart), Number(row.dailyAmount)]));
  for (const [month, suppliedRate] of suppliedRateByMonth) {
    const storedRate = rateByMonth.get(month);
    if (storedRate !== undefined && storedRate !== suppliedRate) {
      if (lockedMonths.has(month)) {
        throw new MonthlyRateConflictError(`${month}'s daily rate is already in use and cannot be changed.`);
      }
      await tx.contributionMonthRate.update({
        where: {
          contributionPlanId_monthStart: {
            contributionPlanId: plan.id,
            monthStart: new Date(`${month}-01T00:00:00.000Z`),
          },
        },
        data: { dailyAmount: suppliedRate },
      });
      rateByMonth.set(month, suppliedRate);
    }
  }

  let inheritedRate = requestedMonthlyRate ?? rateByMonth.get(calendarMonthKey(firstDate)) ?? Number(plan.dailyAmount);
  let available = Number(plan.creditBalance) + amount;
  let cursor = firstDate;
  const rows: { contributionPlanId: string; contributionId: string; coverageDate: Date; amount: number }[] = [];

  // A bounded loop protects the database from an accidental enormous entry;
  // any excess remains visible as credit and is never discarded.
  while (rows.length < 3_660) {
    const key = calendarMonthKey(cursor);
    let dailyAmount = rateByMonth.get(key);
    if (!dailyAmount) {
      const suppliedRate = suppliedRateByMonth.get(key);
      if (!suppliedRate) {
        if (available < inheritedRate) break;
        throw new MonthlyRateRequiredError(`Confirm the daily rate for ${cursor.toLocaleDateString("en-NG", { month: "long", year: "numeric", timeZone: "UTC" })} before recording this payment.`);
      }
      dailyAmount = suppliedRate;
      await tx.contributionMonthRate.create({
        data: { contributionPlanId: plan.id, monthStart: calendarMonthStart(cursor), dailyAmount },
      });
      rateByMonth.set(key, dailyAmount);
    }
    inheritedRate = dailyAmount;
    if (available < dailyAmount) break;
    rows.push({ contributionPlanId: plan.id, contributionId, coverageDate: cursor, amount: dailyAmount });
    available -= dailyAmount;
    cursor = addDaysToDate(cursor, 1);
  }

  if (rows.length > 0) {
    await tx.contributionAllocation.createMany({
      data: rows,
    });
  }

  await tx.contributionPlan.update({
    where: { id: plan.id },
    data: {
      creditBalance: available,
      nextCoverageDate: cursor,
      status: "ACTIVE",
    },
  });

  return { fullSlots: rows.length, creditBalance: available };
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

  const { customerProfileId, status, amount, monthlyDailyAmount, note } = parsed.data;

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

      if (status === "MISSED") {
        if (collectionDate < toDateOnly(plan.startDate)) {
          return {
            success: false as const,
            error: "This savings period has not started yet, so today cannot be marked as missed.",
          };
        }
        const fundedToday = await tx.contributionAllocation.findUnique({
          where: {
            contributionPlanId_coverageDate: {
              contributionPlanId: plan.id,
              coverageDate: collectionDate,
            },
          },
          select: { id: true },
        });
        if (fundedToday) {
          return {
            success: false as const,
            error: "Today is already covered by this customer's savings. It cannot be marked as missed.",
          };
        }
      }

      const alreadyRecorded = await tx.contribution.findFirst({
        where: { contributionPlanId: plan.id, collectionDate },
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
        await allocateCollectedAmount(tx, plan, created.id, Number(amount), monthlyDailyAmount);
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
    if (error instanceof MonthlyRateConflictError || error instanceof MonthlyRateRequiredError) return fail(error.message);
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
 *   gate Admin-only backdating on this flag rather than trusting the client.
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

  const { customerProfileId, amount, monthlyDailyAmount, monthlyRates, paymentMethod, note, confirmAdditionalPayment } = parsed.data;
  const clientRequestId = parsed.data.clientRequestId;

  // Only Admins can backdate. Agents are pinned to the server's business date.
  const collectionDate = actorIsAdmin && parsed.data.paymentDate
    ? toDateOnly(parsed.data.paymentDate)
    : today();
  if (collectionDate > today()) return fail("A payment cannot be dated in the future.");

  // Draw the receipt number BEFORE the transaction — nextval() on a
  // sequence is its own atomic operation.
  const receiptNumber = await generateContributionReceiptNumber();

  try {
    const result = await runFinancialTransaction(async (tx) => {
      await lockCustomerFinancialState(tx, customerProfileId);
      const previousRequest = await tx.contribution.findUnique({ where: { clientRequestId } });
      if (previousRequest) {
        if (
          previousRequest.customerProfileId !== customerProfileId ||
          previousRequest.collectedById !== collectedById ||
          Number(previousRequest.amount) !== amount ||
          previousRequest.collectionDate.getTime() !== collectionDate.getTime()
        ) {
          return { success: false as const, error: "This payment request was already used. Reopen Quick Pay to record a new payment." };
        }
        return { success: true as const, contribution: previousRequest, allocation: null, replayed: true as const };
      }
      const paymentsToday = await tx.contribution.count({
        where: { customerProfileId, collectionDate, status: "COLLECTED" },
      });
      if (paymentsToday > 0 && !confirmAdditionalPayment) {
        return { success: false as const, error: "A payment is already recorded for this customer on this date. Confirm that this is another payment, then try again." };
      }
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
          clientRequestId,
        },
      });
      const allocation = await allocateCollectedAmount(
        tx,
        plan,
        created.id,
        amount,
        monthlyDailyAmount,
        monthlyRates,
      );
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
          additionalPaymentOnDate: paymentsToday > 0,
        },
      }, audit);
      return { success: true as const, contribution: created, allocation, replayed: false as const };
    });
    if (!result.success) return fail(result.error);

    return ok({
      contributionId: result.contribution.id,
      receiptNumber: result.contribution.receiptNumber!,
      slotsFunded: result.allocation?.fullSlots ?? 0,
      creditBalance: result.allocation?.creditBalance ?? 0,
    });
  } catch (error) {
    if (error instanceof MonthlyRateConflictError || error instanceof MonthlyRateRequiredError) return fail(error.message);
    if (isUniqueConstraintConflict(error)) {
      return fail("This payment request was already processed. Reopen Quick Pay to check its receipt before trying again.");
    }
    throw error;
  }
}
