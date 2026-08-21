"use server";

/**
 * Server Actions for Agent management (Admin-only).
 * ----------------------------------------------------------------------------
 * This is the ONLY place that decides "is the caller allowed to
 * create/edit/deactivate an Agent?" — by calling requireRole("ADMIN") before
 * doing anything else. The service functions themselves
 * (server/services/agent.service.ts) have no idea who's calling them; role
 * enforcement always happens here, at the boundary.
 */
import { requireRole } from "@/lib/session";
import { createAgent, updateAgent, setAgentActive } from "@/server/services/agent.service";
import type { CreateAgentInput, EditAgentInput, SetAgentActiveInput } from "@/validations/auth";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/server/services/audit.service";
import { sendAgentInvitationEmail } from "@/server/services/email.service";
import { getApplicationOrigin } from "@/lib/application-origin";
import { hashStaffVerificationToken } from "@/lib/staff-verification-token";
import { ok } from "@/lib/action-result";
import { refreshAgentInvitationToken } from "@/server/services/staff-email-verification.service";

export async function createAgentAction(input: CreateAgentInput) {
  const user = await requireRole("ADMIN");

  const result = await createAgent(input);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "AGENT_CREATED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "User", entityId: result.success ? result.data.id : undefined, summary: result.success ? `Agent ${input.name} created.` : result.message });

  if (result.success) {
    let invitationSent = false;
    try {
      const delivery = await sendAgentInvitationEmail({
        to: result.data.email,
        agentName: result.data.name,
        invitationToken: result.data.invitationToken,
        applicationOrigin: await getApplicationOrigin(),
        idempotencyKey: invitationIdempotencyKey(result.data.id, result.data.invitationToken),
      });
      invitationSent = delivery.success;
      await writeAuditLog({
        actorId: user.id,
        actorRole: user.role,
        action: "AGENT_INVITATION_SENT",
        outcome: delivery.success ? "SUCCESS" : "FAILURE",
        entityType: "User",
        entityId: result.data.id,
        summary: delivery.success ? "Agent verification invitation sent." : delivery.message,
      });
    } catch {
      await writeAuditLog({
        actorId: user.id,
        actorRole: user.role,
        action: "AGENT_INVITATION_SENT",
        outcome: "FAILURE",
        entityType: "User",
        entityId: result.data.id,
        summary: "Agent verification invitation could not be sent.",
      });
    }
    // Refresh the agents list page's cached data after a successful create.
    revalidatePath("/admin/agents");
    return ok({ id: result.data.id, invitationSent });
  }

  return result;
}

export async function resendAgentInvitationAction(agentId: string) {
  const user = await requireRole("ADMIN");
  const invitation = await refreshAgentInvitationToken(agentId);
  if (!invitation.success) return invitation;

  let delivery;
  try {
    delivery = await sendAgentInvitationEmail({
      to: invitation.data.email,
      agentName: invitation.data.name,
      invitationToken: invitation.data.invitationToken,
      applicationOrigin: await getApplicationOrigin(),
      idempotencyKey: invitationIdempotencyKey(invitation.data.id, invitation.data.invitationToken),
    });
  } catch {
    delivery = { success: false as const, message: "The verification email could not be sent." };
  }
  await writeAuditLog({
    actorId: user.id,
    actorRole: user.role,
    action: "AGENT_INVITATION_RESENT",
    outcome: delivery.success ? "SUCCESS" : "FAILURE",
    entityType: "User",
    entityId: agentId,
    summary: delivery.success ? "Agent verification invitation resent." : delivery.message,
  });
  revalidatePath(`/admin/agents/${agentId}`);
  return delivery.success ? ok({ invitationSent: true }) : delivery;
}

function invitationIdempotencyKey(userId: string, token: string) {
  return `agent-invite-${userId}-${hashStaffVerificationToken(token).slice(0, 16)}`;
}

export async function updateAgentAction(input: EditAgentInput) {
  const user = await requireRole("ADMIN");

  const result = await updateAgent(input);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "AGENT_UPDATED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "User", entityId: input.id, summary: result.success ? "Agent details updated." : result.message });

  if (result.success) {
    let invitationSent: boolean | null = null;
    if (result.data.emailChanged && result.data.invitationToken) {
      try {
        const delivery = await sendAgentInvitationEmail({
          to: result.data.email,
          agentName: result.data.name,
          invitationToken: result.data.invitationToken,
          applicationOrigin: await getApplicationOrigin(),
          idempotencyKey: invitationIdempotencyKey(result.data.id, result.data.invitationToken),
        });
        invitationSent = delivery.success;
        await writeAuditLog({
          actorId: user.id,
          actorRole: user.role,
          action: "AGENT_EMAIL_REVERIFICATION_SENT",
          outcome: delivery.success ? "SUCCESS" : "FAILURE",
          entityType: "User",
          entityId: input.id,
          summary: delivery.success ? "Agent email reverification sent." : delivery.message,
        });
      } catch {
        invitationSent = false;
      }
    }
    revalidatePath("/admin/agents");
    revalidatePath(`/admin/agents/${input.id}`);
    return ok({ id: result.data.id, emailChanged: result.data.emailChanged, invitationSent });
  }

  return result;
}

export async function setAgentActiveAction(input: SetAgentActiveInput) {
  const user = await requireRole("ADMIN");

  const result = await setAgentActive(input);
  await writeAuditLog({ actorId: user.id, actorRole: user.role, action: "AGENT_STATUS_CHANGED", outcome: result.success ? "SUCCESS" : "FAILURE", entityType: "User", entityId: input.id, summary: result.success ? `Agent status changed to ${input.isActive ? "active" : "inactive"}.` : result.message });

  if (result.success) {
    revalidatePath("/admin/agents");
    revalidatePath(`/admin/agents/${input.id}`);
  }

  return result;
}
