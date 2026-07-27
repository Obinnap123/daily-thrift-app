/**
 * Payout ("Maturity/Payout") business logic.
 * ----------------------------------------------------------------------------
 * recordPayout() is the ONLY write path for the entire payout module, and
 * creating the Payout row IS the "Mark account as Paid" action — there is no
 * separate status toggle. In the same transaction it also flips the linked
 * ContributionPlan.status to PAID_OUT, so a plan can never end up PAID_OUT
 * without a corresponding Payout record (or vice versa).
 *
 * ⚠️ No online payment integration anywhere in this file: this function only
 * RECORDS that a payout happened and how (cash / bank transfer) — it never
 * calls out to a payment processor, moves funds, or stores bank account
 * numbers. All money changes hands manually, outside this system, before
 * this form is ever submitted.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { toDateOnly } from "@/lib/date";
import { generateReceiptNumber } from "@/lib/receipt-number";
import { recordPayoutSchema, type RecordPayoutInput } from "@/validations/payout";
import { findPlanById } from "@/server/repositories/contribution-plan.repository";
import { findPayoutByPlanId } from "@/server/repositories/payout.repository";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export async function recordPayout(
  input: RecordPayoutInput,
  approvedById: string
): Promise<ActionResult<{ payoutId: string; receiptNumber: string }>> {
  const parsed = recordPayoutSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { contributionPlanId, payoutMethod, payoutDate, note } = parsed.data;

  const plan = await findPlanById(contributionPlanId);
  if (!plan) {
    return fail("Savings plan not found.");
  }
  if (plan.status !== "COMPLETED") {
    return fail(
      plan.status === "PAID_OUT"
        ? "This customer has already been paid out for this cycle."
        : "This customer's savings cycle is not yet complete — payout is only available once all required days are paid."
    );
  }

  const existingPayout = await findPayoutByPlanId(contributionPlanId);
  if (existingPayout) {
    return fail("A payout has already been recorded for this savings cycle.");
  }

  // Snapshot the total saved NOW, from the plan's own Contribution rows —
  // stored explicitly on the Payout row so the receipt/history stays
  // correct even if contributions were edited afterward.
  const contributions = await prisma.contribution.findMany({
    where: { contributionPlanId, status: "COLLECTED" },
    select: { amount: true },
  });
  const totalSavings = contributions.reduce((sum, c) => sum + Number(c.amount ?? 0), 0);

  // Draw the receipt number BEFORE the transaction — nextval() on a
  // sequence is its own atomic operation (same reasoning as
  // generateCustomerCode in Step 3).
  const receiptNumber = await generateReceiptNumber();

  const payout = await prisma.$transaction(async (tx) => {
    const created = await tx.payout.create({
      data: {
        contributionPlanId,
        customerProfileId: plan.customerProfileId,
        totalSavings,
        payoutMethod,
        payoutDate: toDateOnly(payoutDate),
        approvedById,
        receiptNumber,
        note: note || null,
      },
    });

    // Creating the Payout row IS "Mark as Paid" — flip the plan's status in
    // the same transaction so the two can never disagree.
    await tx.contributionPlan.update({
      where: { id: contributionPlanId },
      data: { status: "PAID_OUT" },
    });

    return created;
  });

  return ok({ payoutId: payout.id, receiptNumber: payout.receiptNumber });
}
