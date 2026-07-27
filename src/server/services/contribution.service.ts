/**
 * Contribution ("Daily Contribution Recording") business logic.
 * ----------------------------------------------------------------------------
 * recordContribution() is the one write path for the entire savings-tracking
 * system: it creates today's Contribution row for a customer AND, in the
 * same transaction, asks contribution-plan.service to re-check whether that
 * payment just completed the cycle. Every dashboard number this module
 * exposes ultimately traces back to a row written here.
 *
 * Deliberately always uses the SERVER's current date (`today()`), never a
 * date supplied by the client — an agent cannot backdate or future-date a
 * collection through this form, which keeps "today's collections" numbers
 * on every dashboard trustworthy.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/date";
import {
  recordContributionSchema,
  type RecordContributionInput,
} from "@/validations/contribution";
import { findActivePlanForCustomer } from "@/server/repositories/contribution-plan.repository";
import { findContributionForPlanAndDate } from "@/server/repositories/contribution.repository";
import { refreshPlanCompletionStatus } from "@/server/services/contribution-plan.service";
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

  const contribution = await prisma.contribution.create({
    data: {
      contributionPlanId: plan.id,
      customerProfileId,
      collectedById,
      collectionDate,
      status,
      amount: status === "COLLECTED" ? amount : null,
      note: note || null,
    },
  });

  // Re-check whether this payment just completed the cycle. Kept as a
  // separate call (not inline here) so contribution-plan.service owns all
  // "what does completion mean" logic in one place.
  await refreshPlanCompletionStatus(plan.id);

  return ok({ contributionId: contribution.id });
}
