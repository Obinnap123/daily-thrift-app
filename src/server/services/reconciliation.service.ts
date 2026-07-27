/**
 * DailyReconciliation ("End-of-Day Reconciliation") business logic.
 * ----------------------------------------------------------------------------
 * submitReconciliation(): an agent's once-per-day cash reconciliation.
 * `expectedCash` is snapshotted from that agent's own Contribution rows for
 * today AT SUBMISSION TIME (not recomputed later), so the report always
 * reflects exactly what the agent saw and confirmed against.
 *
 * reviewReconciliation(): Admin-only approve/reject with an optional note —
 * the second half of the workflow.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { today } from "@/lib/date";
import { sumCollectedByAgent } from "@/server/repositories/contribution.repository";
import { findReconciliationForAgentAndDate } from "@/server/repositories/reconciliation.repository";
import {
  submitReconciliationSchema,
  reviewReconciliationSchema,
  type SubmitReconciliationInput,
  type ReviewReconciliationInput,
} from "@/validations/reconciliation";
import { ok, fail, type ActionResult } from "@/lib/action-result";

export async function submitReconciliation(
  input: SubmitReconciliationInput,
  agentId: string
): Promise<ActionResult<{ reconciliationId: string }>> {
  const parsed = submitReconciliationSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { actualCash, agentNote } = parsed.data;
  const reconciliationDate = today();

  const existing = await findReconciliationForAgentAndDate(agentId, reconciliationDate);
  if (existing) {
    return fail("You have already submitted today's collection report.");
  }

  const expectedCash = await sumCollectedByAgent(agentId, {
    start: reconciliationDate,
    end: reconciliationDate,
  });

  const report = await prisma.dailyReconciliation.create({
    data: {
      agentId,
      reconciliationDate,
      expectedCash,
      actualCash,
      agentNote: agentNote || null,
      status: "SUBMITTED",
    },
  });

  return ok({ reconciliationId: report.id });
}

export async function reviewReconciliation(
  input: ReviewReconciliationInput,
  reviewedById: string
): Promise<ActionResult<{ reconciliationId: string }>> {
  const parsed = reviewReconciliationSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { reconciliationId, decision, reviewNote } = parsed.data;

  const report = await prisma.dailyReconciliation.findUnique({ where: { id: reconciliationId } });
  if (!report) {
    return fail("Reconciliation report not found.");
  }
  if (report.status !== "SUBMITTED") {
    return fail("This report has already been reviewed.");
  }

  await prisma.dailyReconciliation.update({
    where: { id: reconciliationId },
    data: {
      status: decision,
      reviewedById,
      reviewNote: reviewNote || null,
      reviewedAt: new Date(),
    },
  });

  return ok({ reconciliationId });
}
