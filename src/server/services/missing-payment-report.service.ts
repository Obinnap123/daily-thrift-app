import "server-only";

import { prisma } from "@/lib/prisma";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import { today, toDateOnly } from "@/lib/date";
import { isUniqueConstraintConflict } from "@/lib/prisma-errors";
import { createAuditLog, type AuditActorContext } from "@/server/services/audit.service";
import {
  reviewMissingPaymentReportSchema,
  submitMissingPaymentReportSchema,
  type ReviewMissingPaymentReportInput,
  type SubmitMissingPaymentReportInput,
} from "@/validations/missing-payment-report";

export async function submitMissingPaymentReport(
  input: SubmitMissingPaymentReportInput,
  customerProfileId: string,
  customerName: string,
  audit: AuditActorContext,
): Promise<ActionResult<{ reportId: string }>> {
  const parsed = submitMissingPaymentReportSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.");

  const paymentDate = toDateOnly(parsed.data.paymentDate);
  if (paymentDate > today()) return fail("A missing payment cannot be reported for a future date.");

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.missingPaymentReport.findFirst({
        where: { customerProfileId, paymentDate, status: "OPEN" },
        select: { id: true },
      });
      if (existing) {
        return {
          success: false as const,
          error: "You already have an open report for this payment date.",
        };
      }

      const activePlan = await tx.contributionPlan.findFirst({
        where: { customerProfileId, status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      const report = await tx.missingPaymentReport.create({
        data: {
          customerProfileId,
          contributionPlanId: activePlan?.id,
          paymentDate,
          reportedAmount: parsed.data.reportedAmount,
          customerNote: parsed.data.customerNote || null,
        },
      });

      const admins = await tx.user.findMany({
        where: { role: "ADMIN", isActive: true },
        select: { id: true },
      });
      if (admins.length > 0) {
        await tx.notification.createMany({
          data: admins.map(({ id }) => ({
            recipientId: id,
            title: "Missing payment reported",
            message: `${customerName} reported ₦${parsed.data.reportedAmount.toLocaleString()} paid on ${paymentDate.toISOString().slice(0, 10)} as not reflected.`,
            href: "/admin/payment-reports",
          })),
        });
      }

      await createAuditLog(tx, {
        actorId: audit.actorId,
        actorRole: audit.actorRole,
        action: "MISSING_PAYMENT_REPORTED",
        outcome: "SUCCESS",
        entityType: "MissingPaymentReport",
        entityId: report.id,
        summary: "Customer reported a payment that is not reflected.",
        metadata: {
          customerProfileId,
          paymentDate: paymentDate.toISOString().slice(0, 10),
          reportedAmount: parsed.data.reportedAmount,
        },
      }, audit);

      return { success: true as const, reportId: report.id };
    });

    if (!result.success) return fail(result.error);
    return ok({ reportId: result.reportId });
  } catch (error) {
    if (isUniqueConstraintConflict(error)) {
      return fail("You already have an open report for this payment date.");
    }
    throw error;
  }
}

export async function reviewMissingPaymentReport(
  input: ReviewMissingPaymentReportInput,
  adminId: string,
  audit: AuditActorContext,
): Promise<ActionResult<{ reportId: string }>> {
  const parsed = reviewMissingPaymentReportSchema.safeParse(input);
  if (!parsed.success) return fail("Enter a short review note before completing this report.");

  const { reportId, decision, reviewNote } = parsed.data;
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.missingPaymentReport.updateMany({
      where: { id: reportId, status: "OPEN" },
      data: {
        status: decision,
        reviewedById: adminId,
        reviewNote,
        reviewedAt: new Date(),
      },
    });
    if (updated.count !== 1) {
      const exists = await tx.missingPaymentReport.findUnique({
        where: { id: reportId },
        select: { id: true },
      });
      return {
        success: false as const,
        error: exists ? "This report has already been reviewed." : "Payment report not found.",
      };
    }

    await createAuditLog(tx, {
      actorId: audit.actorId,
      actorRole: audit.actorRole,
      action: "MISSING_PAYMENT_REPORT_REVIEWED",
      outcome: "SUCCESS",
      entityType: "MissingPaymentReport",
      entityId: reportId,
      summary: `Missing payment report ${decision.toLowerCase()}.`,
      metadata: { decision },
    }, audit);

    return { success: true as const };
  });

  if (!result.success) return fail(result.error);
  return ok({ reportId });
}
