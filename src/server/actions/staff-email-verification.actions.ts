"use server";

import { getAuditRequestContext } from "@/server/services/audit.service";
import { completeAgentInvitation } from "@/server/services/staff-email-verification.service";
import type { CompleteAgentInvitationInput } from "@/validations/auth";

export async function completeAgentInvitationAction(input: CompleteAgentInvitationInput) {
  const requestContext = await getAuditRequestContext();
  return completeAgentInvitation(input, requestContext);
}
