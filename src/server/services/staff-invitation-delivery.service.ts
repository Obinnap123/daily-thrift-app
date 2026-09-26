import "server-only";

import { prisma } from "@/lib/prisma";
import { fail, type ActionResult } from "@/lib/action-result";
import { sendAgentInvitationEmail } from "@/server/services/email.service";
import { getApplicationOrigin } from "@/lib/application-origin";

/**
 * Complete the two-phase invitation process after the email provider returns.
 *
 * A replacement token is inserted as pending before delivery. Failed tokens
 * are removed, leaving the previous delivered link usable. On success, the
 * newest delivered token becomes the only valid link for that user.
 */
export async function finalizeStaffInvitationDelivery(input: {
  userId: string;
  tokenHash: string;
  delivered: boolean;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`staff-invitation:${input.userId}`}))::text`;

    const token = await tx.staffEmailVerificationToken.findFirst({
      where: { userId: input.userId, tokenHash: input.tokenHash },
      select: { id: true },
    });
    if (!token) return false;

    if (!input.delivered) {
      await tx.staffEmailVerificationToken.delete({ where: { id: token.id } });
      return false;
    }

    await tx.staffEmailVerificationToken.update({
      where: { id: token.id },
      data: { deliveredAt: new Date() },
    });

    const newestDelivered = await tx.staffEmailVerificationToken.findFirst({
      where: { userId: input.userId, deliveredAt: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
    if (newestDelivered) {
      await tx.staffEmailVerificationToken.deleteMany({
        where: {
          userId: input.userId,
          deliveredAt: { not: null },
          id: { not: newestDelivered.id },
        },
      });
    }
    return newestDelivered?.id === token.id;
  });
}

export async function deliverStaffInvitation(input: {
  userId: string;
  email: string;
  name: string;
  token: string;
  tokenHash: string;
  idempotencyKey: string;
  role: "Agent" | "Admin";
}): Promise<ActionResult<{ emailId: string }>> {
  let delivery: ActionResult<{ emailId: string }>;
  try {
    delivery = await sendAgentInvitationEmail({
      to: input.email,
      agentName: input.name,
      invitationToken: input.token,
      applicationOrigin: await getApplicationOrigin(),
      idempotencyKey: input.idempotencyKey,
      role: input.role,
    });
  } catch {
    delivery = fail("The verification email could not be sent. Please try again.");
  }

  try {
    const activated = await finalizeStaffInvitationDelivery({
      userId: input.userId,
      tokenHash: input.tokenHash,
      delivered: delivery.success,
    });
    if (delivery.success && !activated) {
      return fail(
        "A newer invitation was sent at the same time. Ask the recipient to use the most recent email.",
      );
    }
  } catch (error) {
    console.error("Invitation delivery finalization failed", error);
    return fail(
      delivery.success
        ? "The email provider accepted the message, but its link could not be activated. Please resend the invitation."
        : delivery.message,
    );
  }
  return delivery;
}
