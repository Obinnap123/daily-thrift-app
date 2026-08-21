"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { findCustomerProfileByUserId } from "@/server/repositories/customer.repository";
import {
  reviewMissingPaymentReport,
  submitMissingPaymentReport,
} from "@/server/services/missing-payment-report.service";
import {
  getAuditRequestContext,
  writeRequiredAuditLog,
} from "@/server/services/audit.service";
import { fail } from "@/lib/action-result";
import type {
  ReviewMissingPaymentReportInput,
  SubmitMissingPaymentReportInput,
} from "@/validations/missing-payment-report";

export async function submitMissingPaymentReportAction(
  input: SubmitMissingPaymentReportInput,
) {
  const user = await requireRole("CUSTOMER");
  const profile = await findCustomerProfileByUserId(user.id);
  if (!profile) return fail("Customer profile not found.");

  const requestContext = await getAuditRequestContext();
  const result = await submitMissingPaymentReport(input, profile.id, profile.user.name, {
    actorId: user.id,
    actorRole: user.role,
    ...requestContext,
  });

  if (!result.success) {
    await writeRequiredAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "MISSING_PAYMENT_REPORTED",
      outcome: "FAILURE",
      entityType: "CustomerProfile",
      entityId: profile.id,
      summary: result.message,
    }, requestContext);
  } else {
    revalidatePath("/customer");
    revalidatePath("/admin/payment-reports");
    revalidatePath("/notifications");
  }

  return result;
}

export async function reviewMissingPaymentReportAction(
  input: ReviewMissingPaymentReportInput,
) {
  const user = await requireRole("ADMIN");
  const requestContext = await getAuditRequestContext();
  const result = await reviewMissingPaymentReport(input, user.id, {
    actorId: user.id,
    actorRole: user.role,
    ...requestContext,
  });

  if (!result.success) {
    await writeRequiredAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: "MISSING_PAYMENT_REPORT_REVIEWED",
      outcome: "FAILURE",
      entityType: "MissingPaymentReport",
      entityId: input.reportId,
      summary: result.message,
    }, requestContext);
  } else {
    revalidatePath("/admin/payment-reports");
    revalidatePath("/customer");
  }

  return result;
}
