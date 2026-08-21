"use server";

import { getAuditRequestContext, writeAuditLog } from "@/server/services/audit.service";
import { completeAgentInvitation } from "@/server/services/staff-email-verification.service";
import type { CompleteAgentInvitationInput } from "@/validations/auth";

export async function completeAgentInvitationAction(input: CompleteAgentInvitationInput) {
  const requestContext = await getAuditRequestContext();
  const result = await completeAgentInvitation(input, requestContext);
  if (!result.success) {
    await writeAuditLog({
      action: "STAFF_EMAIL_VERIFIED",
      outcome: "FAILURE",
      entityType: "User",
      summary: result.message,
    }, requestContext);
  }
  return result;
}
