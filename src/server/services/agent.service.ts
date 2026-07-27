/**
 * Agent business logic (Admin-only operations).
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { normalizePhone } from "@/lib/phone";
import { createAgentSchema, type CreateAgentInput } from "@/validations/auth";
import { findUserByEmail, findUserByPhone } from "@/server/repositories/user.repository";
import { ok, fail, type ActionResult } from "@/lib/action-result";

/**
 * Create a new Agent account. Only an Admin should ever call this — the
 * caller (Server Action) is responsible for verifying the session role
 * before invoking this function; this function itself does not re-check
 * the caller's role since it has no access to the request/session.
 */
export async function createAgent(input: CreateAgentInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createAgentSchema.safeParse(input);
  if (!parsed.success) {
    return fail("Please correct the highlighted fields.");
  }

  const { name, email, phone, password } = parsed.data;
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

  const passwordHash = await hashPassword(password);

  const agent = await prisma.user.create({
    data: {
      name,
      email,
      phone: normalizedPhone,
      passwordHash,
      role: "AGENT",
    },
    select: { id: true },
  });

  return ok(agent);
}
