/**
 * Agent > Register Customer page.
 * ----------------------------------------------------------------------------
 * Same shared form as the Admin version, but in the Agent context the
 * "Assigned Agent" dropdown is not rendered at all (the `agents` prop is
 * omitted) — the agent can only ever register customers under themselves.
 *
 * Reminder: hiding the field here is a UX nicety only. The real enforcement
 * happens server-side in registerCustomerAction(), which forcibly overrides
 * assignedAgentId to the caller's own id whenever the caller's role is
 * AGENT, regardless of what this form would have sent.
 */
import { requireRole } from "@/lib/session";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { RegisterCustomerForm } from "@/components/forms/RegisterCustomerForm";
import Link from "next/link";

export default async function AgentNewCustomerPage() {
  const user = await requireRole("AGENT");

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Agent Dashboard" />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-lg">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Register Customer</h2>
            <Link href="/agent" className="text-sm font-medium text-emerald-700 hover:underline">
              &larr; Back to my customers
            </Link>
          </div>
          <Card>
            <RegisterCustomerForm redirectTo="/agent" currentAgentId={user.id} />
          </Card>
        </div>
      </main>
    </div>
  );
}
