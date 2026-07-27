/**
 * Auth.js (NextAuth v5) configuration.
 * ----------------------------------------------------------------------------
 * We use the Credentials provider (email + password) because Davchuks Daily
 * Thrift is an internal business system, not a public consumer app — there's
 * no need for social/OAuth logins. Sessions are signed JWTs (not stored in
 * the database), which keeps things fast and avoids needing the NextAuth
 * Account/Session/VerificationToken tables.
 *
 * Security notes:
 * - Passwords are verified against bcrypt hashes (see lib/password.ts).
 * - Inactive accounts (isActive = false) cannot log in.
 * - We never leak whether an email exists vs. a wrong password was supplied —
 *   both return the same generic "Invalid email or password" error.
 */
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/validations/auth";
import { authConfig } from "@/lib/auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(rawCredentials) {
        // Validate shape/format before touching the database.
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;

        // Block disabled accounts (e.g. an agent who was let go).
        if (!user.isActive) return null;

        const isValidPassword = await verifyPassword(password, user.passwordHash);
        if (!isValidPassword) return null;

        // Record the successful login time. We deliberately `await` this
        // (rather than fire-and-forget) because serverless/edge runtimes can
        // terminate the function as soon as the response is sent, which
        // would silently drop an un-awaited update before it reaches the DB.
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        // The object returned here becomes `user` in the jwt() callback below.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  // jwt/session callbacks are inherited from authConfig (see auth.config.ts).
});
