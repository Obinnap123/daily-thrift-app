"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  getAuditRequestContext,
  writeRequiredAuditLog,
} from "@/server/services/audit.service";
import { notifyAdmins } from "@/server/repositories/notification.repository";
import {
  requestContributionCorrection,
  reviewContributionCorrection,
  applyContributionCorrection,
} from "@/server/services/contribution-correction.service";
import type {
  RequestContributionCorrectionInput,
  ReviewContributionCorrectionInput,
  ApplyContributionCorrectionInput,
} from "@/validations/contribution-correction";
import type { Role } from "@/generated/prisma/client";

const paths = [
  "/admin/corrections",
  "/agent/corrections",
  "/admin",
  "/agent",
  "/admin/reports",
  "/admin/payouts",
  "/agent/payouts",
  "/admin/tracking",
  "/agent/tracking",
  "/customer",
];

function refreshCorrectionViews() {
  for (const path of paths) revalidatePath(path);
}

async function auditCorrectionFailure(input: {
  actorId: string;
  actorRole: Role;
  action: string;
  entityId: string;
  message: string;
  requestContext: Awaited<ReturnType<typeof getAuditRequestContext>>;
}) {
  await writeRequiredAuditLog({
    actorId: input.actorId,
    actorRole: input.actorRole,
    action: input.action,
    outcome: "FAILURE",
    entityType: "ContributionCorrectionRequest",
    entityId: input.entityId,
    summary: input.message,
  }, input.requestContext);
}

export async function requestContributionCorrectionAction(input: RequestContributionCorrectionInput) {
  const user = await requireRole("AGENT");
  const requestContext = await getAuditRequestContext();
  const result = await requestContributionCorrection(input, user.id, {
    actorId: user.id,
    actorRole: user.role,
    ...requestContext,
  });
  if (result.success) {
    await notifyAdmins({
      title: "Payment correction requested",
      message: `${user.name} requested permission to correct a recorded payment.`,
      href: "/admin/corrections",
    });
    refreshCorrectionViews();
  } else {
    await auditCorrectionFailure({
      actorId: user.id,
      actorRole: user.role,
      action: "CONTRIBUTION_CORRECTION_REQUESTED",
      entityId: input.contributionId,
      message: result.message,
      requestContext,
    });
  }
  return result;
}

export async function reviewContributionCorrectionAction(input: ReviewContributionCorrectionInput) {
  const user = await requireRole("ADMIN");
  const requestContext = await getAuditRequestContext();
  const result = await reviewContributionCorrection(input, user.id, {
    actorId: user.id,
    actorRole: user.role,
    ...requestContext,
  });
  if (result.success) {
    await prisma.notification.create({
      data: {
        recipientId: result.data.agentId,
        title: input.decision === "APPROVED" ? "Payment correction approved" : "Payment correction rejected",
        message: input.decision === "APPROVED"
          ? "Your one-hour window to correct the payment is now open."
          : "Your payment correction request was rejected.",
        href: "/agent/corrections",
      },
    });
    refreshCorrectionViews();
  } else {
    await auditCorrectionFailure({
      actorId: user.id,
      actorRole: user.role,
      action: `CONTRIBUTION_CORRECTION_${input.decision}`,
      entityId: input.correctionRequestId,
      message: result.message,
      requestContext,
    });
  }
  return result;
}

export async function applyContributionCorrectionAction(input: ApplyContributionCorrectionInput) {
  const user = await requireRole("AGENT");
  const requestContext = await getAuditRequestContext();
  const result = await applyContributionCorrection(input, user.id, {
    actorId: user.id,
    actorRole: user.role,
    ...requestContext,
  });
  if (result.success) {
    await notifyAdmins({
      title: "Payment correction completed",
      message: `${user.name} corrected an approved payment. Tracking and totals were recalculated.`,
      href: "/admin/corrections",
    });
    refreshCorrectionViews();
  } else {
    await auditCorrectionFailure({
      actorId: user.id,
      actorRole: user.role,
      action: "CONTRIBUTION_CORRECTION_APPLIED",
      entityId: input.correctionRequestId,
      message: result.message,
      requestContext,
    });
  }
  return result;
}
