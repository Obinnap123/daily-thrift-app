/**
 * Edge-safe Auth.js base configuration.
 * ----------------------------------------------------------------------------
 * Next.js middleware runs on the Edge Runtime, which does NOT support
 * Node.js built-ins (fs, node:url, TCP sockets, etc.) — so it cannot load
 * Prisma directly. This file therefore contains ONLY the parts of the auth
 * config that are safe on the Edge Runtime: pages, session strategy, and the
 * jwt/session callbacks (pure data transformations, no DB calls).
 *
 * `src/lib/auth.ts` extends this config by adding the Credentials provider
 * (whose `authorize()` needs Prisma) for use in Node.js contexts: API routes
 * and Server Components. `src/middleware.ts` uses this file directly.
 */
import type { NextAuthConfig } from "next-auth";
import type { Role } from "@/generated/prisma/client";

export const authConfig: NextAuthConfig = {
  // Required when running behind a reverse proxy (this sandbox, and most
  // production hosts like Railway/Render/Fly.io) where the incoming Host
  // header may differ from what Auth.js expects by default. We still only
  // ever cookie-scope sessions to the actual configured NEXTAUTH_URL/domain.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hour session lifetime, suitable for a work shift
  },
  pages: {
    signIn: "/login",
  },
  providers: [], // Real providers are added in lib/auth.ts (Node runtime only).
  callbacks: {
    // Persist custom fields (id, role) into the JWT on sign-in.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.sessionVersion = user.sessionVersion;
        token.revoked = false;
      }
      return token;
    },
    // Expose the custom JWT fields on the session object used by the app.
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.sessionVersion =
          typeof token.sessionVersion === "number" ? token.sessionVersion : -1;
        session.user.revoked = token.revoked !== false;
      }
      return session;
    },
  },
};
