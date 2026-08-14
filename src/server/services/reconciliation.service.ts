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
import { today } from "@/lib/date";
import {
  submitReconciliationSchema,
  reviewReconciliationSchema,
  type SubmitReconciliationInput,
  type ReviewReconciliationInput,
} from "@/validations/reconciliation";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import {
  lockReconciliationState,
  runFinancialTransaction,
} from "@/lib/financial-transaction";
import { isUniqueConstraintConflict } from "@/lib/prisma-errors";
import {
  createAuditLog,
  type AuditActorContext,
} from "@/server/services/audit.service";

export async function submitReconciliation(
  input: SubmitReconciliationInput,
  agentId: string,
  audit: AuditActorContext,
): Promise<ActionResult<{ reconciliationId: string }>> {
  const parsed = submitReconciliationSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { actualCash, agentNote } = parsed.data;
  const reconciliationDate = today();

  try {
    const result = await runFinancialTransaction(async (tx) => {
      await lockReconciliationState(tx, agentId, reconciliationDate);
      const existing = await tx.dailyReconciliation.findUnique({
        where: { agentId_reconciliationDate: { agentId, reconciliationDate } },
        select: { id: true },
      });
      if (existing) return { success: false as const, error: "You have already submitted today's collection report." };

      const aggregate = await tx.contribution.aggregate({
        where: {
          collectedById: agentId,
          collectionDate: reconciliationDate,
          status: "COLLECTED",
          paymentMethod: "CASH",
        },
        _sum: { amount: true },
      });
      const report = await tx.dailyReconciliation.create({
        data: {
          agentId,
          reconciliationDate,
          expectedCash: aggregate._sum.amount ?? 0,
          actualCash,
          agentNote: agentNote || null,
          status: "SUBMITTED",
        },
      });
      await createAuditLog(tx, {
        actorId: audit.actorId,
        actorRole: audit.actorRole,
        action: "RECONCILIATION_SUBMITTED",
        outcome: "SUCCESS",
        entityType: "DailyReconciliation",
        entityId: report.id,
        summary: "End-of-day reconciliation submitted.",
        metadata: {
          reconciliationDate: reconciliationDate.toISOString().slice(0, 10),
          expectedCash: Number(aggregate._sum.amount ?? 0),
          actualCash,
        },
      }, audit);
      return { success: true as const, reconciliationId: report.id };
    });
    if (!result.success) return fail(result.error);
    return ok({ reconciliationId: result.reconciliationId });
  } catch (error) {
    if (isUniqueConstraintConflict(error)) {
      return fail("You have already submitted today's collection report.");
    }
    throw error;
  }
}

export async function reviewReconciliation(
  input: ReviewReconciliationInput,
  reviewedById: string,
  audit: AuditActorContext,
): Promise<ActionResult<{ reconciliationId: string }>> {
  const parsed = reviewReconciliationSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { reconciliationId, decision, reviewNote } = parsed.data;

  const result = await runFinancialTransaction(async (tx) => {
    const updated = await tx.dailyReconciliation.updateMany({
      where: { id: reconciliationId, status: "SUBMITTED" },
      data: {
        status: decision,
        reviewedById,
        reviewNote: reviewNote || null,
        reviewedAt: new Date(),
      },
    });

    if (updated.count !== 1) {
      const exists = await tx.dailyReconciliation.findUnique({
        where: { id: reconciliationId }, select: { id: true },
      });
      return {
        success: false as const,
        error: exists ? "This report has already been reviewed." : "Reconciliation report not found.",
      };
    }

    await createAuditLog(tx, {
      actorId: audit.actorId,
      actorRole: audit.actorRole,
      action: "RECONCILIATION_REVIEWED",
      outcome: "SUCCESS",
      entityType: "DailyReconciliation",
      entityId: reconciliationId,
      summary: `Reconciliation ${decision.toLowerCase()}.`,
      metadata: { decision },
    }, audit);
    return { success: true as const };
  });

  if (!result.success) return fail(result.error);
  return ok({ reconciliationId });
}
