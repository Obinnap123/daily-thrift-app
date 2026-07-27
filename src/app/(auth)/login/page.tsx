/**
 * Login chooser page.
 * ----------------------------------------------------------------------------
 * Landing point for anyone visiting /login directly (or bounced here by
 * middleware with no role context yet). Shows three role buttons — Admin
 * Login, Agent Login, Customer Login — each linking to its own dedicated
 * login page (/login/admin, /login/agent, /login/customer) where the actual
 * sign-in form lives. Keeping one shared chooser plus three thin
 * role-specific pages means the underlying auth logic (LoginForm) stays in
 * exactly one place while the entry point is still role-obvious for users.
 */
import Link from "next/link";
import { Card } from "@/components/ui/Card";

const ROLE_LOGIN_LINKS = [
  {
    href: "/login/admin",
    label: "Admin Login",
    description: "For system administrators managing agents, customers, and reports.",
    icon: AdminIcon,
  },
  {
    href: "/login/agent",
    label: "Agent Login",
    description: "For field agents recording daily collections for their customers.",
    icon: AgentIcon,
  },
  {
    href: "/login/customer",
    label: "Customer Login",
    description: "For customers checking their savings progress and payout history.",
    icon: CustomerIcon,
  },
];

export default async function LoginChooserPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  // Forward `callbackUrl` (set by middleware when it bounces an
  // unauthenticated visitor here from a protected route) through to
  // whichever role page the user picks next, so they land back on the
  // page they originally wanted after signing in.
  const { callbackUrl } = await searchParams;
  const query = callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Davchuks Daily Thrift</h1>
          <p className="mt-1 text-sm text-gray-500">Choose how you&apos;d like to sign in</p>
        </div>
        <Card className="flex flex-col gap-3">
          {ROLE_LOGIN_LINKS.map(({ href, label, description, icon: Icon }) => (
            <Link
              key={href}
              href={`${href}${query}`}
              className="flex items-center gap-4 rounded-lg border border-gray-200 p-4 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50"
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Icon />
              </span>
              <span>
                <span className="block text-sm font-semibold text-gray-900">{label}</span>
                <span className="block text-xs text-gray-500">{description}</span>
              </span>
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}

function AdminIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path
        fillRule="evenodd"
        d="M10 1c-1.716 0-3.408.106-5.07.31C3.806 1.45 3 2.414 3 3.517V18.25a.75.75 0 0 0 1.075.676L10 16.082l5.925 2.844A.75.75 0 0 0 17 18.25V3.517c0-1.103-.806-2.068-1.93-2.207A41.403 41.403 0 0 0 10 1Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function AgentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm-6.001 12.826a.75.75 0 0 1-.049-1.028A7.484 7.484 0 0 1 10 13.5a7.484 7.484 0 0 1 6.05 3.298.75.75 0 0 1-.05 1.028A9.464 9.464 0 0 1 10 20a9.464 9.464 0 0 1-6.001-2.174Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CustomerIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path
        fillRule="evenodd"
        d="M10 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM3.465 14.493a1.23 1.23 0 0 0 .41 1.412A9.957 9.957 0 0 0 10 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 0 0-13.074.003Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
