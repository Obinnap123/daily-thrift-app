/**
 * Agent business logic (Admin-only operations).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import {
  createAgentSchema,
  editAgentSchema,
  setAgentActiveSchema,
  type CreateAgentInput,
  type EditAgentInput,
  type SetAgentActiveInput,
} from "@/validations/auth";
import { findUserByEmail, findUserByPhone } from "@/server/repositories/user.repository";
import { findAgentById } from "@/server/repositories/agent.repository";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { randomBytes } from "node:crypto";
import { createStaffVerificationToken } from "@/lib/staff-verification-token";

/**
 * Create a new Agent account. Only an Admin should ever call this — the
 * caller (Server Action) is responsible for verifying the session role
 * before invoking this function; this function itself does not re-check
 * the caller's role since it has no access to the request/session.
 */
export async function createAgent(input: CreateAgentInput): Promise<ActionResult<{
  id: string;
  name: string;
  email: string;
  invitationToken: string;
}>> {
  const parsed = createAgentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { name, email, phone } = parsed.data;
  const normalizedPhone = phone ? normalizePhone(phone) : null;

  // Friendly, field-specific duplicate checks (rather than letting a raw
  // Postgres unique-constraint error bubble up as a generic 500).
  const existingByEmail = await findUserByEmail(email);
  if (existingByEmail) {
    return fail("An account with this email already exists.", {
      email: "This email is already registered.",
    });
  }

  if (normalizedPhone) {
    const existingByPhone = await findUserByPhone(normalizedPhone);
    if (existingByPhone) {
      return fail("An account with this phone number already exists.", {
        phone: "This phone number is already registered.",
      });
    }
  }

  const passwordHash = await hashPassword(randomBytes(32).toString("base64url"));
  const invitation = createStaffVerificationToken();

  const agent = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email,
        phone: normalizedPhone,
        passwordHash,
        role: "AGENT",
        emailVerifiedAt: null,
      },
      select: { id: true, name: true, email: true },
    });
    await tx.staffEmailVerificationToken.create({
      data: {
        userId: created.id,
        tokenHash: invitation.tokenHash,
        expiresAt: invitation.expiresAt,
      },
    });
    return created;
  });

  return ok({ ...agent, email: agent.email!, invitationToken: invitation.token });
}

/**
 * Update an existing Agent's profile fields (name, email, phone).
 * Password changes are intentionally out of scope here (a separate,
 * deliberate "reset password" action belongs in a later step).
 */
export async function updateAgent(input: EditAgentInput): Promise<ActionResult<{
  id: string;
  name: string;
  email: string;
  emailChanged: boolean;
  invitationToken: string | null;
}>> {
  const parsed = editAgentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { id, name, email, phone } = parsed.data;
  const normalizedPhone = phone ? normalizePhone(phone) : null;

  const existingAgent = await findAgentById(id);
  if (!existingAgent) {
    return fail("Agent not found.");
  }

  // Duplicate checks that exclude this agent's OWN current record —
  // otherwise saving the form without changing email/phone would
  // incorrectly flag "already registered" against themselves.
  const existingByEmail = await findUserByEmail(email);
  if (existingByEmail && existingByEmail.id !== id) {
    return fail("Another account with this email already exists.", {
      email: "This email is already registered.",
    });
  }

  if (normalizedPhone) {
    const existingByPhone = await findUserByPhone(normalizedPhone);
    if (existingByPhone && existingByPhone.id !== id) {
      return fail("Another account with this phone number already exists.", {
        phone: "This phone number is already registered.",
      });
    }
  }

  const emailChanged = email !== existingAgent.email;
  const invitation = emailChanged ? createStaffVerificationToken() : null;
  const agent = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        name,
        email,
        phone: normalizedPhone,
        // A changed login email must be verified again and all sessions
        // issued for the previous email are revoked immediately.
        ...(emailChanged
          ? { sessionVersion: { increment: 1 }, emailVerifiedAt: null }
          : {}),
      },
      select: { id: true, name: true, email: true },
    });
    if (invitation) {
      // A token sent to the previous email address must never verify the new
      // address. The new token remains pending until delivery is confirmed.
      await tx.staffEmailVerificationToken.deleteMany({ where: { userId: id } });
      await tx.staffEmailVerificationToken.create({
        data: { userId: id, tokenHash: invitation.tokenHash, expiresAt: invitation.expiresAt },
      });
    }
    return updated;
  });

  return ok({
    ...agent,
    email: agent.email!,
    emailChanged,
    invitationToken: invitation?.token ?? null,
  });
}

/**
 * Activate or deactivate an Agent account.
 * ----------------------------------------------------------------------------
 * Deactivating an Agent does NOT touch their assigned customers — those
 * customers remain assigned to the (now inactive) agent until an Admin
 * explicitly rotates them to someone else via the existing
 * reassignCustomerAgent flow. We deliberately do NOT auto-reassign here:
 * silently moving a whole book of customers as a side effect of a status
 * toggle would be a surprising, hard-to-audit behavior. The Admin sees a
 * warning in the UI (customer count) before deactivating, and can then
 * reassign each customer deliberately if needed.
 *
 * A deactivated Agent's isActive=false is enforced at login time
 * (lib/auth.ts already rejects inactive accounts) and is also checked by
 * customer registration / reassignment (an inactive agent cannot be
 * assigned new customers).
 */
export async function setAgentActive(
  input: SetAgentActiveInput
): Promise<ActionResult<{ id: string; isActive: boolean }>> {
  const parsed = setAgentActiveSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Invalid request.");
  }

  const { id, isActive } = parsed.data;

  const existingAgent = await findAgentById(id);
  if (!existingAgent) {
    return fail("Agent not found.");
  }

  const agent = await prisma.user.update({
    where: { id },
    data: {
      isActive,
      // Increment on either deactivation or reactivation. Reactivating the
      // account must not make an older, previously revoked JWT valid again.
      sessionVersion: { increment: 1 },
    },
    select: { id: true, isActive: true },
  });

  return ok(agent);
}
