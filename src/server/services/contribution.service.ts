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
import { prisma } from "@/lib/prisma";
import { today, toDateOnly } from "@/lib/date";
import {
  recordContributionSchema,
  quickPaySchema,
  type RecordContributionInput,
  type QuickPayInput,
} from "@/validations/contribution";
import { findActivePlanForCustomer } from "@/server/repositories/contribution-plan.repository";
import { findContributionForPlanAndDate } from "@/server/repositories/contribution.repository";
import { refreshPlanCompletionStatus } from "@/server/services/contribution-plan.service";
import { generateContributionReceiptNumber } from "@/lib/receipt-number";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export async function recordContribution(
  input: RecordContributionInput,
  collectedById: string
): Promise<ActionResult<{ contributionId: string }>> {
  const parsed = recordContributionSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { customerProfileId, status, amount, note } = parsed.data;

  const plan = await findActivePlanForCustomer(customerProfileId);
  if (!plan) {
    return fail(
      "This customer has no active savings plan. Start a plan for them before recording contributions."
    );
  }

  const collectionDate = today();

  const alreadyRecorded = await findContributionForPlanAndDate(plan.id, collectionDate);
  if (alreadyRecorded) {
    return fail("Today's collection has already been recorded for this customer.");
  }

  // Draw the receipt number BEFORE the transaction — nextval() on a
  // sequence is its own atomic operation (same reasoning as
  // generateReceiptNumber() in the Payout module). Only COLLECTED rows get
  // a receipt; a MISSED day has nothing to issue a receipt for.
  const receiptNumber = status === "COLLECTED" ? await generateContributionReceiptNumber() : null;

  const contribution = await prisma.$transaction(async (tx) => {
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
    return created;
  });

  // Re-check whether this payment just completed the cycle. Kept as a
  // separate call (not inline here) so contribution-plan.service owns all
  // "what does completion mean" logic in one place.
  await refreshPlanCompletionStatus(plan.id);

  return ok({ contributionId: contribution.id });
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
  actorIsAdmin: boolean
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

  const plan = await findActivePlanForCustomer(customerProfileId);
  if (!plan) {
    return fail(
      "This customer has no active savings plan. Start a plan for them before recording a payment."
    );
  }

  const existing = await findContributionForPlanAndDate(plan.id, collectionDate);
  if (existing && !isOverride) {
    return fail(
      "A payment has already been recorded for this customer on this date. An Admin can override this from Quick Pay if it's a genuine second payment."
    );
  }
  if (existing && isOverride && !actorIsAdmin) {
    // Defense in depth: should be unreachable because isOverride is forced
    // false above for non-Admins, but guard explicitly anyway.
    return fail("Only an Admin can override a duplicate payment.");
  }

  // Draw the receipt number BEFORE the transaction — nextval() on a
  // sequence is its own atomic operation.
  const receiptNumber = await generateContributionReceiptNumber();

  const contribution = await prisma.$transaction(async (tx) => {
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
    return created;
  });

  // Re-check whether this payment just completed the cycle.
  await refreshPlanCompletionStatus(plan.id);

  return ok({ contributionId: contribution.id, receiptNumber });
}
