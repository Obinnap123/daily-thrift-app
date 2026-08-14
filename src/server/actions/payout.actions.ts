"use server";

import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/action-result";
import { recordPayout } from "@/server/services/payout.service";
import { findPlanById } from "@/server/repositories/contribution-plan.repository";
import { getBusinessSettings } from "@/server/services/settings.service";
import { notifyAdmins } from "@/server/repositories/notification.repository";
import {
  getAuditRequestContext,
  writeRequiredAuditLog,
} from "@/server/services/audit.service";
import type { RecordPayoutInput } from "@/validations/payout";
import { revalidatePath } from "next/cache";

export async function recordPayoutAction(input: RecordPayoutInput) {
  const user = await requireRole(["ADMIN", "AGENT"]);
  const requestContext = await getAuditRequestContext();
  const [plan, settings] = await Promise.all([
    findPlanById(input.contributionPlanId),
    getBusinessSettings(),
  ]);
  if (!plan) {
    const message = "Savings plan not found.";
    await writeRequiredAuditLog({ actorId: user.id, actorRole: user.role, action: "PAYOUT", outcome: "FAILURE", entityType: "ContributionPlan", entityId: input.contributionPlanId, summary: message }, requestContext);
    return fail(message);
  }

  if (user.role === "AGENT" && (!settings.agentPayoutEnabled || plan.customerProfile.assignedAgentId !== user.id)) {
    const message = settings.agentPayoutEnabled
      ? "You can only pay out customers assigned to you."
      : "Agent payouts are currently disabled in Settings.";
    await writeRequiredAuditLog({ actorId: user.id, actorRole: user.role, action: "PAYOUT", outcome: "FAILURE", entityType: "ContributionPlan", entityId: input.contributionPlanId, summary: message }, requestContext);
    return fail(message);
  }

  const result = await recordPayout(input, user.id, {
    actorId: user.id,
    actorRole: user.role,
    ...requestContext,
  });
  if (!result.success) {
    await writeRequiredAuditLog({ actorId: user.id, actorRole: user.role, action: "PAYOUT", outcome: "FAILURE", entityType: "ContributionPlan", entityId: input.contributionPlanId, summary: result.message }, requestContext);
    return result;
  }

  if (user.role === "AGENT" && settings.notifyAdminOnAgentPayout) {
    await notifyAdmins({
      title: "Agent payout completed",
      message: `${user.name} paid out ${plan.customerProfile.user.name} (${result.data.receiptNumber}).`,
      href: `/admin/payouts/${result.data.receiptNumber}`,
    });
  } else if (user.role === "ADMIN" && settings.notifyAgentOnAdminPayout) {
    await prisma.notification.create({
      data: {
        recipientId: plan.customerProfile.assignedAgentId,
        title: "Customer payout completed",
        message: `${plan.customerProfile.user.name} was paid out by ${user.name}.`,
        href: "/agent/payouts",
      },
    });
  }

  for (const path of [
    "/admin", "/admin/payouts", "/admin/customers", "/admin/reports", "/admin/tracking",
    "/agent", "/agent/payouts", "/agent/tracking", "/customer", "/notifications",
  ]) revalidatePath(path);

  return result;
}
