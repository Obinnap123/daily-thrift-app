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
import {
  applySecurityThrottleDelay,
  checkSecurityThrottle,
  clearSecurityThrottle,
  createSecurityThrottleBucket,
  recordSecurityThrottleFailure,
  type SecurityThrottleBucket,
} from "@/server/services/security-throttle.service";

const VERIFICATION_WINDOW_MS = 15 * 60 * 1000;
const VERIFICATION_LOCK_MS = 15 * 60 * 1000;

function verificationBuckets(tokenHash: string, ipAddress: string | null): SecurityThrottleBucket[] {
  const buckets = [createSecurityThrottleBucket("STAFF_VERIFICATION_TOKEN", tokenHash, 5)];
  if (ipAddress) {
    buckets.push(createSecurityThrottleBucket("STAFF_VERIFICATION_IP", ipAddress, 40));
  }
  return buckets;
}

export async function getAgentInvitationDetails(token: string) {
  if (token.length < 32) return null;
  const invitation = await prisma.staffEmailVerificationToken.findUnique({
    where: { tokenHash: hashStaffVerificationToken(token), deliveredAt: { not: null } },
    include: { user: { select: { name: true, email: true, role: true, isActive: true, emailVerifiedAt: true } } },
  });
  if (
    !invitation ||
    invitation.expiresAt <= new Date() ||
    !invitation.user.isActive ||
    (invitation.user.role !== "AGENT" && invitation.user.role !== "ADMIN") ||
    invitation.user.emailVerifiedAt
  ) {
    return null;
  }
  return { name: invitation.user.name, email: invitation.user.email, role: invitation.user.role };
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

    await tx.staffEmailVerificationToken.create({
      data: {
        userId: agent.id,
        tokenHash: invitation.tokenHash,
        expiresAt: invitation.expiresAt,
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
  const buckets = verificationBuckets(tokenHash, audit.ipAddress);
  const throttle = await checkSecurityThrottle(
    buckets,
    { windowMs: VERIFICATION_WINDOW_MS, maximumDelayMs: 2_000 },
  );
  await applySecurityThrottleDelay(throttle.delayMs);
  if (throttle.blocked) {
    return fail("Too many verification attempts. Please wait 15 minutes and try again.");
  }

  // Verify the public token before doing the deliberately expensive bcrypt
  // work. Random invalid tokens therefore cannot be used to exhaust CPU.
  const candidate = await prisma.staffEmailVerificationToken.findUnique({
    where: { tokenHash, deliveredAt: { not: null } },
    include: { user: { select: { role: true, isActive: true, emailVerifiedAt: true } } },
  });
  if (
    !candidate ||
    candidate.expiresAt <= new Date() ||
    !candidate.user.isActive ||
    (candidate.user.role !== "AGENT" && candidate.user.role !== "ADMIN") ||
    candidate.user.emailVerifiedAt
  ) {
    await recordSecurityThrottleFailure(buckets, {
      windowMs: VERIFICATION_WINDOW_MS,
      lockMs: VERIFICATION_LOCK_MS,
      retentionMs: 24 * 60 * 60 * 1000,
    });
    return fail("This invitation is invalid or has expired.");
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const result = await prisma.$transaction(async (tx) => {
    const invitation = await tx.staffEmailVerificationToken.findUnique({
      where: { tokenHash, deliveredAt: { not: null } },
      include: { user: { select: { id: true, role: true, isActive: true, emailVerifiedAt: true } } },
    });
    if (
      !invitation ||
      invitation.expiresAt <= new Date() ||
      !invitation.user.isActive ||
      (invitation.user.role !== "AGENT" && invitation.user.role !== "ADMIN") ||
      invitation.user.emailVerifiedAt
    ) {
      return { success: false as const, error: "This invitation is invalid or has expired." };
    }

    const consumed = await tx.staffEmailVerificationToken.deleteMany({
      where: { id: invitation.id, tokenHash, deliveredAt: { not: null }, expiresAt: { gt: new Date() } },
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
    await tx.staffEmailVerificationToken.deleteMany({
      where: { userId: invitation.user.id },
    });
    await createAuditLog(tx, {
      actorId: invitation.user.id,
      actorRole: invitation.user.role,
      action: "STAFF_EMAIL_VERIFIED",
      outcome: "SUCCESS",
      entityType: "User",
      entityId: invitation.user.id,
      summary: `${invitation.user.role === "ADMIN" ? "Admin" : "Agent"} verified their email and created a password.`,
    }, audit);

    return { success: true as const, agentId: invitation.user.id };
  }, { isolationLevel: "Serializable" });

  if (!result.success) {
    await recordSecurityThrottleFailure(buckets, {
      windowMs: VERIFICATION_WINDOW_MS,
      lockMs: VERIFICATION_LOCK_MS,
      retentionMs: 24 * 60 * 60 * 1000,
    });
    return fail(result.error);
  }
  await clearSecurityThrottle([buckets[0]]);
  return ok({ agentId: result.agentId });
}
