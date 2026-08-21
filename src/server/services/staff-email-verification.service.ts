import "server-only";

import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { fail, ok, type ActionResult } from "@/lib/action-result";
import {
  completeAgentInvitationSchema,
  type CompleteAgentInvitationInput,
} from "@/validations/auth";
import {
  createStaffVerificationToken,
  hashStaffVerificationToken,
} from "@/lib/staff-verification-token";
import { createAuditLog, type AuditRequestContext } from "@/server/services/audit.service";

export async function getAgentInvitationDetails(token: string) {
  if (token.length < 32) return null;
  const invitation = await prisma.staffEmailVerificationToken.findUnique({
    where: { tokenHash: hashStaffVerificationToken(token) },
    include: { user: { select: { name: true, email: true, role: true, emailVerifiedAt: true } } },
  });
  if (
    !invitation ||
    invitation.expiresAt <= new Date() ||
    invitation.user.role !== "AGENT" ||
    invitation.user.emailVerifiedAt
  ) {
    return null;
  }
  return { name: invitation.user.name, email: invitation.user.email };
}

export async function refreshAgentInvitationToken(agentId: string): Promise<ActionResult<{
  id: string;
  name: string;
  email: string;
  invitationToken: string;
}>> {
  const invitation = createStaffVerificationToken();
  const result = await prisma.$transaction(async (tx) => {
    const agent = await tx.user.findFirst({
      where: { id: agentId, role: "AGENT" },
      select: { id: true, name: true, email: true, emailVerifiedAt: true },
    });
    if (!agent) return { success: false as const, error: "Agent not found." };
    if (agent.emailVerifiedAt) {
      return { success: false as const, error: "This agent's email is already verified." };
    }
    if (!agent.email) return { success: false as const, error: "This agent has no email address." };

    await tx.staffEmailVerificationToken.upsert({
      where: { userId: agent.id },
      create: {
        userId: agent.id,
        tokenHash: invitation.tokenHash,
        expiresAt: invitation.expiresAt,
      },
      update: {
        tokenHash: invitation.tokenHash,
        expiresAt: invitation.expiresAt,
        createdAt: new Date(),
      },
    });
    return { success: true as const, agent };
  });

  if (!result.success) return fail(result.error);
  return ok({
    id: result.agent.id,
    name: result.agent.name,
    email: result.agent.email!,
    invitationToken: invitation.token,
  });
}

export async function completeAgentInvitation(
  input: CompleteAgentInvitationInput,
  audit: AuditRequestContext,
): Promise<ActionResult<{ agentId: string }>> {
  const parsed = completeAgentInvitationSchema.safeParse(input);
  if (!parsed.success) return fail("Please correct the highlighted fields.");

  const tokenHash = hashStaffVerificationToken(parsed.data.token);
  const passwordHash = await hashPassword(parsed.data.password);
  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.staffEmailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, role: true, emailVerifiedAt: true } } },
    });
    if (
      !invitation ||
      invitation.expiresAt <= new Date() ||
      invitation.user.role !== "AGENT" ||
      invitation.user.emailVerifiedAt
    ) {
      return { success: false as const, error: "This invitation is invalid or has expired." };
    }

    const consumed = await tx.staffEmailVerificationToken.deleteMany({
      where: { id: invitation.id, tokenHash, expiresAt: { gt: new Date() } },
    });
    if (consumed.count !== 1) {
      return { success: false as const, error: "This invitation is invalid or has expired." };
    }

    await tx.user.update({
      where: { id: invitation.user.id },
      data: {
        passwordHash,
        emailVerifiedAt: new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    await createAuditLog(tx, {
      actorId: invitation.user.id,
      actorRole: "AGENT",
      action: "STAFF_EMAIL_VERIFIED",
      outcome: "SUCCESS",
      entityType: "User",
      entityId: invitation.user.id,
      summary: "Agent verified their email and created a password.",
    }, audit);

    return { success: true as const, agentId: invitation.user.id };
  }, { isolationLevel: "Serializable" });

  return result.success ? ok({ agentId: result.agentId }) : fail(result.error);
}
