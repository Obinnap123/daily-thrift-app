/**
 * Server-side session/authorization helpers.
 * ----------------------------------------------------------------------------
 * Middleware (src/middleware.ts) already blocks a request from *reaching* the
 * wrong dashboard section by URL. These helpers are the second, defense-in-
 * depth layer: every Server Component, Server Action, and API route that
 * performs a privileged read/write calls one of these to re-verify the
 * caller's identity and role directly from the (tamper-proof, signed) JWT
 * session — never trust that "the URL was allowed" is enough on its own.
 */
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma/enums";

/** Returns the current session's user, or null if not logged in. */
export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Require the caller to be logged in, optionally as one of a specific set
 * of roles. Redirects to /login (if unauthenticated) or to the caller's own
 * dashboard (if authenticated but wrong role) rather than throwing — this
 * keeps Server Component pages simple and gives the user a sane landing
 * spot instead of a raw error screen.
 */
export async function requireRole(allowedRoles: Role | Role[]) {
  const user = await getCurrentUser();
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  if (!user) {
    redirect("/login");
  }

  if (!roles.includes(user.role)) {
    const roleHome: Record<Role, string> = {
      ADMIN: "/admin",
      AGENT: "/agent",
      CUSTOMER: "/customer",
    };
    redirect(roleHome[user.role]);
  }

  return user;
}
