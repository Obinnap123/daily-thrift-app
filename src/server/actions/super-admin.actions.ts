"use server";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/session";
import { hashPassword } from "@/lib/password";
import { createStaffVerificationToken, hashStaffVerificationToken } from "@/lib/staff-verification-token";
import { getAuditRequestContext, createAuditLog, writeAuditLog } from "@/server/services/audit.service";
import { deliverStaffInvitation } from "@/server/services/staff-invitation-delivery.service";
import {
  validateAdminArchive,
  validateAdminStatusChange,
} from "@/lib/admin-account-policy";
import { fail, ok } from "@/lib/action-result";
import { revalidatePath } from "next/cache";

const adminInput = z.object({
  name: z.string().trim().min(2, "Enter the Admin's name."),
  email: z.email("Enter a valid email address.").trim().toLowerCase(),
});

export async function inviteAdminAction(input: { name: string; email: string }) {
  const actor = await requireRole("SUPER_ADMIN");
  const parsed = adminInput.safeParse(input);
  if (!parsed.success) return fail("Enter a valid name and email address.");
  const audit = await getAuditRequestContext();
  const invitation = createStaffVerificationToken();
  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));

  const result = await prisma.$transaction(async (tx) => {
    // Serialize competing invitations from separate browser sessions.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(392541, 1)::text`;
    const activeAdmin = await tx.user.findFirst({ where: { role: "ADMIN", isActive: true, archivedAt: null }, select: { id: true } });
    if (activeAdmin) return fail("An active Admin already exists. Only one can be active at a time.");
    const existing = await tx.user.findUnique({ where: { email: parsed.data.email }, select: { id: true } });
    if (existing) return fail("An account with this email already exists.");

    const admin = await tx.user.create({
      data: { ...parsed.data, role: "ADMIN", passwordHash, emailVerifiedAt: null },
      select: { id: true, name: true, email: true },
    });
    await tx.staffEmailVerificationToken.create({
      data: { userId: admin.id, tokenHash: invitation.tokenHash, expiresAt: invitation.expiresAt },
    });
    await createAuditLog(tx, {
      actorId: actor.id, actorRole: actor.role, action: "ADMIN_INVITED", outcome: "SUCCESS",
      entityType: "User", entityId: admin.id, summary: `Admin invitation created for ${admin.name}.`,
    }, audit);
    return ok(admin);
  }, { isolationLevel: "Serializable" });
  if (!result.success) return result;

  let delivery: Awaited<ReturnType<typeof deliverStaffInvitation>>;
  try {
    delivery = await deliverStaffInvitation({
      userId: result.data.id,
      email: result.data.email!, name: result.data.name, token: invitation.token,
      tokenHash: invitation.tokenHash, role: "Admin",
      idempotencyKey: `admin-invite-${result.data.id}-${hashStaffVerificationToken(invitation.token).slice(0, 16)}`,
    });
  } catch {
    delivery = fail("The Admin account was created, but email delivery could not start. Check APP_URL and resend the invitation.");
  }
  await writeAuditLog({
    actorId: actor.id, actorRole: actor.role, action: "ADMIN_INVITATION_SENT",
    outcome: delivery.success ? "SUCCESS" : "FAILURE", entityType: "User", entityId: result.data.id,
    summary: delivery.success ? "Admin invitation email sent." : delivery.message,
  }, audit);
  revalidatePath("/super-admin/admin");
  return ok({ invitationSent: delivery.success, deliveryMessage: delivery.success ? null : delivery.message });
}

export async function resendAdminInvitationAction(adminId: string) {
  const actor = await requireRole("SUPER_ADMIN");
  const audit = await getAuditRequestContext();
  const invitation = createStaffVerificationToken();
  const result = await prisma.$transaction(async (tx) => {
    const admin = await tx.user.findFirst({ where: { id: adminId, role: "ADMIN", isActive: true, archivedAt: null, emailVerifiedAt: null }, select: { id: true, name: true, email: true } });
    if (!admin?.email) return fail("No pending Admin invitation was found.");
    await tx.staffEmailVerificationToken.create({
      data: { userId: admin.id, tokenHash: invitation.tokenHash, expiresAt: invitation.expiresAt },
    });
    await createAuditLog(tx, { actorId: actor.id, actorRole: actor.role, action: "ADMIN_INVITATION_RENEWED", outcome: "SUCCESS", entityType: "User", entityId: admin.id, summary: "Admin invitation link renewed." }, audit);
    return ok(admin);
  });
  if (!result.success) return result;
  let delivery: Awaited<ReturnType<typeof deliverStaffInvitation>>;
  try {
    delivery = await deliverStaffInvitation({
      userId: result.data.id,
      email: result.data.email!, name: result.data.name, token: invitation.token,
      tokenHash: invitation.tokenHash, role: "Admin",
      idempotencyKey: `admin-invite-${result.data.id}-${hashStaffVerificationToken(invitation.token).slice(0, 16)}`,
    });
  } catch {
    delivery = fail("The verification email could not be sent. Check APP_URL and try again.");
  }
  await writeAuditLog({ actorId: actor.id, actorRole: actor.role, action: "ADMIN_INVITATION_SENT", outcome: delivery.success ? "SUCCESS" : "FAILURE", entityType: "User", entityId: adminId, summary: delivery.success ? "Admin invitation email resent." : delivery.message }, audit);
  return delivery.success ? ok({ invitationSent: true }) : delivery;
}

export async function setAdminActiveAction(adminId: string, isActive: boolean) {
  const actor = await requireRole("SUPER_ADMIN");
  const audit = await getAuditRequestContext();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(392541, 1)::text`;
    const admin = await tx.user.findFirst({ where: { id: adminId, role: "ADMIN" }, select: { id: true, isActive: true, archivedAt: true } });
    const other = isActive
      ? await tx.user.findFirst({ where: { role: "ADMIN", isActive: true, archivedAt: null, id: { not: adminId } }, select: { id: true } })
      : null;
    const policyError = validateAdminStatusChange({
      account: {
        exists: Boolean(admin),
        isActive: admin?.isActive ?? false,
        isArchived: Boolean(admin?.archivedAt),
      },
      makeActive: isActive,
      anotherActiveAdminExists: Boolean(other),
    });
    if (policyError) return fail(policyError);
    if (!admin) return fail("Admin account not found.");
    if (admin.isActive === isActive) return ok({ isActive });
    await tx.user.update({ where: { id: adminId }, data: { isActive, sessionVersion: { increment: 1 } } });
    await createAuditLog(tx, { actorId: actor.id, actorRole: actor.role, action: "ADMIN_STATUS_CHANGED", outcome: "SUCCESS", entityType: "User", entityId: adminId, summary: `Admin account ${isActive ? "activated" : "deactivated"}.` }, audit);
    return ok({ isActive });
  }, { isolationLevel: "Serializable" });
  revalidatePath("/super-admin/admin");
  return result;
}

export async function archiveAdminAction(adminId: string) {
  const actor = await requireRole("SUPER_ADMIN");
  const audit = await getAuditRequestContext();
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(392541, 1)::text`;
    const admin = await tx.user.findFirst({
      where: { id: adminId, role: "ADMIN" },
      select: { id: true, name: true, isActive: true, archivedAt: true },
    });
    const policyError = validateAdminArchive({
      exists: Boolean(admin),
      isActive: admin?.isActive ?? false,
      isArchived: Boolean(admin?.archivedAt),
    });
    if (policyError) return fail(policyError);
    if (!admin) return fail("Admin account not found or already archived.");

    await tx.user.update({
      where: { id: admin.id },
      data: { archivedAt: new Date(), sessionVersion: { increment: 1 } },
    });
    await tx.staffEmailVerificationToken.deleteMany({ where: { userId: admin.id } });
    await createAuditLog(tx, {
      actorId: actor.id,
      actorRole: actor.role,
      action: "ADMIN_ARCHIVED",
      outcome: "SUCCESS",
      entityType: "User",
      entityId: admin.id,
      summary: `Admin account for ${admin.name} archived. Historical records were retained.`,
    }, audit);
    return ok({ archived: true });
  }, { isolationLevel: "Serializable" });

  revalidatePath("/super-admin/admin");
  revalidatePath("/super-admin");
  return result;
}
