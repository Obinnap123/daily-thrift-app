/**
 * Route protection proxy.
 * ----------------------------------------------------------------------------
 * Runs on every request (except static assets) and:
 *  1. Redirects unauthenticated users away from any /admin, /agent, /customer
 *     dashboard route, back to /login.
 *  2. Enforces that a role can only access its own dashboard section
 *     (e.g. a CUSTOMER cannot browse to /admin by guessing the URL).
 *
 * Fine-grained per-page authorization (e.g. "can this Agent edit this
 * specific Customer") still happens inside each route/API handler — this
 * proxy only handles coarse-grained section access.
 */
// IMPORTANT: Proxy must stay independent of the application's Prisma client.
// We therefore build a lightweight NextAuth instance here from the shared
// `authConfig` only (no Credentials provider / DB calls), purely to read and
// verify the session JWT. The full database-backed auth instance remains in
// `src/lib/auth.ts` for API routes and Server Components.
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const ROLE_HOME: Record<string, string> = {
  SUPER_ADMIN: "/super-admin",
  ADMIN: "/admin",
  AGENT: "/agent",
  CUSTOMER: "/customer",
};

const protectedRouteProxy = auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth;
  const role = req.auth?.user?.role;

  const isOnAdminSection = nextUrl.pathname.startsWith("/admin");
  const isOnSuperAdminSection = nextUrl.pathname.startsWith("/super-admin");
  const isOnAgentSection = nextUrl.pathname.startsWith("/agent");
  const isOnCustomerSection = nextUrl.pathname.startsWith("/customer");

  // 1. Not logged in but trying to reach a protected dashboard -> send to login.
  if (!isLoggedIn && (isOnSuperAdminSection || isOnAdminSection || isOnAgentSection || isOnCustomerSection)) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Logged in but role doesn't match the section they're trying to access.
  if (isLoggedIn) {
    if (isOnSuperAdminSection && role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL(ROLE_HOME[role ?? ""] ?? "/", nextUrl.origin));
    }
    if (isOnAdminSection && role !== "ADMIN") {
      return NextResponse.redirect(new URL(ROLE_HOME[role ?? ""] ?? "/", nextUrl.origin));
    }
    if (isOnAgentSection && role !== "AGENT") {
      return NextResponse.redirect(new URL(ROLE_HOME[role ?? ""] ?? "/", nextUrl.origin));
    }
    if (isOnCustomerSection && role !== "CUSTOMER") {
      return NextResponse.redirect(new URL(ROLE_HOME[role ?? ""] ?? "/", nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export default protectedRouteProxy;

// Only run the proxy on real pages — skip static files, images, and
// Next.js internals for performance.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|offline.html|icons/|.*\\.png$).*)",
  ],
};
