"use server";

/**
 * Server Actions for End-of-Day cash reconciliation.
 *  - submitReconciliationAction: AGENT only (an agent submits their OWN report).
 *  - reviewReconciliationAction: ADMIN only.
 */
import { requireRole } from "@/lib/session";
import { submitReconciliation, reviewReconciliation } from "@/server/services/reconciliation.service";
import type { SubmitReconciliationInput, ReviewReconciliationInput } from "@/validations/reconciliation";
import { revalidatePath } from "next/cache";
import {
  getAuditRequestContext,
  writeRequiredAuditLog,
} from "@/server/services/audit.service";
import { notifyAdmins } from "@/server/repositories/notification.repository";
import { prisma } from "@/lib/prisma";

export async function submitReconciliationAction(input: SubmitReconciliationInput) {
  const user = await requireRole("AGENT");
  const requestContext = await getAuditRequestContext();

  const result = await submitReconciliation(input, user.id, {
    actorId: user.id,
    actorRole: user.role,
    ...requestContext,
  });
  if (!result.success) {
    await writeRequiredAuditLog({ actorId: user.id, actorRole: user.role, action: "RECONCILIATION_SUBMITTED", outcome: "FAILURE", entityType: "DailyReconciliation", summary: result.message }, requestContext);
  }

  if (result.success) {
    revalidatePath("/agent/reconciliation");
    revalidatePath("/admin/reconciliations");
    await notifyAdmins({ title: "Reconciliation submitted", message: `${user.name} submitted an end-of-day cash report.`, href: "/admin/reconciliations" });
  }

  return result;
}

export async function reviewReconciliationAction(input: ReviewReconciliationInput) {
  const user = await requireRole("ADMIN");
  const requestContext = await getAuditRequestContext();

  const result = await reviewReconciliation(input, user.id, {
    actorId: user.id,
    actorRole: user.role,
    ...requestContext,
  });
  const report = await prisma.dailyReconciliation.findUnique({ where: { id: input.reconciliationId }, select: { agentId: true } });
  if (!result.success) {
    await writeRequiredAuditLog({ actorId: user.id, actorRole: user.role, action: "RECONCILIATION_REVIEWED", outcome: "FAILURE", entityType: "DailyReconciliation", entityId: input.reconciliationId, summary: result.message }, requestContext);
  }

  if (result.success) {
    revalidatePath("/admin/reconciliations");
    revalidatePath("/agent/reconciliation");
    if (report) await prisma.notification.create({ data: { recipientId: report.agentId, title: `Reconciliation ${input.decision.toLowerCase()}`, message: `Your end-of-day report was ${input.decision.toLowerCase()} by ${user.name}.`, href: "/agent/reconciliation" } });
  }

  return result;
}
