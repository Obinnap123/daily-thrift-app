/**
 * Auth.js (NextAuth v5) configuration.
 * ----------------------------------------------------------------------------
 * We use the Credentials provider because Davchuks Daily Thrift is an
 * internal business system, not a public consumer app — there's no need for
 * social/OAuth logins. Sessions are signed JWTs (not stored in the
 * database), which keeps things fast and avoids needing the NextAuth
 * Account/Session/VerificationToken tables.
 *
 * Login identifier rule:
 * - ADMIN and AGENT accounts always have an email and log in with it.
 * - CUSTOMER accounts log in with their PHONE NUMBER (many customers don't
 *   have an email address in this business context).
 * We accept a single "identifier" field from the login form and decide
 * whether to look it up as an email or a phone number based on its shape
 * (see resolveIdentifierLookup below) — this keeps the login page to one
 * simple field instead of a confusing "are you staff or a customer?" toggle.
 *
 * Security notes:
 * - Passwords are verified against bcrypt hashes (see lib/password.ts).
 * - Inactive accounts (isActive = false) cannot log in.
 * - We never leak whether an account exists vs. a wrong password was
 *   supplied — both return the same generic "Invalid credentials" error.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/validations/auth";
import { normalizePhone } from "@/lib/phone";
import { writeAuditLog } from "@/server/services/audit.service";
import { authConfig } from "@/lib/auth.config";
import type { Role } from "@/generated/prisma/client";
import {
  isSessionSecurityStateCurrent,
  parseSessionSecurityClaims,
} from "@/lib/session-revocation";
import {
  applyLoginDelay,
  checkLoginThrottle,
  clearSuccessfulIdentifierThrottle,
  createLoginThrottleContext,
  recordLoginFailure,
} from "@/server/services/login-throttle.service";

// A valid bcrypt hash used only to equalize the work performed when an
// identifier does not exist. It is not an account credential.
const DUMMY_PASSWORD_HASH =
  "$2b$12$lshVbfxJxuBhIfSPJIEWn.o2wNor5KiV6nxCbVOSHj/BBYfCGi38C";

/**
 * Decide how to look up the entered identifier: as an email (contains "@")
 * or as a phone number (normalized to digits/leading "+" otherwise).
 * Returned as a discriminated union rather than a Prisma type directly, to
 * avoid coupling this file to Prisma's generated internal type paths.
 */
function resolveIdentifierLookup(
  identifier: string
): { email: string } | { phone: string } {
  const trimmed = identifier.trim();
  if (trimmed.includes("@")) {
    return { email: trimmed.toLowerCase() };
  }
  return { phone: normalizePhone(trimmed) };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email or Phone Number", type: "text" },
        password: { label: "Password", type: "password" },
        portalRole: { label: "Portal role", type: "text" },
      },
      async authorize(rawCredentials, request) {
        // Validate shape/format before touching the database.
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { identifier, password, portalRole } = parsed.data;
        const throttleContext = createLoginThrottleContext(identifier, request);
        const throttleDecision = await checkLoginThrottle(throttleContext);
        await applyLoginDelay(throttleDecision.delayMs);

        if (throttleDecision.blocked) {
          await writeAuditLog({
            action: "SIGN_IN",
            outcome: "FAILURE",
            summary: "Sign-in rejected by temporary login throttling.",
          });
          return null;
        }

        async function rejectLogin(
          summary: string,
          account?: { id: string; role: Role },
        ) {
          await Promise.all([
            recordLoginFailure(throttleContext),
            writeAuditLog({
              actorId: account?.id,
              actorRole: account?.role,
              action: "SIGN_IN",
              outcome: "FAILURE",
              entityType: account ? "User" : undefined,
              entityId: account?.id,
              summary,
            }),
          ]);
          return null;
        }

        const user = await prisma.user.findUnique({
          where: resolveIdentifierLookup(identifier),
        });
        if (!user) {
          await verifyPassword(password, DUMMY_PASSWORD_HASH);
          return rejectLogin("Sign-in rejected: invalid credentials.");
        }

        // Perform password verification before evaluating account state or
        // portal role so external response timing does not reveal which check
        // failed. The browser still receives one generic credentials error.
        const isValidPassword = await verifyPassword(password, user.passwordHash);

        if (user.role !== portalRole) {
          return rejectLogin("Sign-in rejected: incorrect portal.", user);
        }

        // Block disabled accounts (e.g. an agent who was let go).
        if (!user.isActive) {
          return rejectLogin("Sign-in rejected: account is inactive.", user);
        }

        if (!isValidPassword) {
          return rejectLogin("Sign-in rejected: invalid credentials.", user);
        }

        // Record the successful login time. We deliberately `await` this
        // (rather than fire-and-forget) because serverless/edge runtimes can
        // terminate the function as soon as the response is sent, which
        // would silently drop an un-awaited update before it reaches the DB.
        await Promise.all([
          prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
          writeAuditLog({ actorId: user.id, actorRole: user.role, action: "SIGN_IN", outcome: "SUCCESS", entityType: "User", entityId: user.id, summary: `${user.name} signed in.` }),
          clearSuccessfulIdentifierThrottle(throttleContext),
        ]);

        // The object returned here becomes `user` in the jwt() callback below.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
        token.revoked = false;
        return token;
      }

      const claims = parseSessionSecurityClaims({
        id: token.id,
        role: token.role,
        sessionVersion: token.sessionVersion,
      });
      if (!claims) {
        token.revoked = true;
        return token;
      }

      const currentAccount = await prisma.user.findUnique({
        where: { id: claims.userId },
        select: { isActive: true, role: true, sessionVersion: true },
      });

      token.revoked = !isSessionSecurityStateCurrent(claims, currentAccount);

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : "";
        session.user.role = token.role as Role;
        session.user.sessionVersion =
          typeof token.sessionVersion === "number" ? token.sessionVersion : -1;
        session.user.revoked = token.revoked !== false;
      }
      return session;
    },
  },
});
