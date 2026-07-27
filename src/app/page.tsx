/**
 * Root landing page.
 * ----------------------------------------------------------------------------
 * Logged-in users are redirected straight to their role's dashboard.
 * Logged-out visitors see a minimal landing screen with a link to log in.
 * (Middleware also protects /admin, /agent, /customer directly, but doing
 * the redirect here too gives a nicer landing experience at "/".)
 */
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";

const ROLE_HOME: Record<string, string> = {
  ADMIN: "/admin",
  AGENT: "/agent",
  CUSTOMER: "/customer",
};

export default async function Home() {
  const session = await auth();

  if (session?.user?.role) {
    redirect(ROLE_HOME[session.user.role] ?? "/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-bold text-gray-900">
        Davchuks Daily Thrift Management System
      </h1>
      <p className="max-w-md text-gray-600">
        Manage daily contributions, savings progress, and manual payouts — built
        for admins, agents, and customers.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
      >
        Sign in to continue
      </Link>
    </div>
  );
}
