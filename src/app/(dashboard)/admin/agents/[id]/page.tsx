/**
 * Admin > Agent detail page.
 * ----------------------------------------------------------------------------
 * Combines three related operations for a single agent in one place:
 *  1. Edit Agent — update name/email/phone.
 *  2. Activate/Deactivate Agent — soft-disable login without deleting data.
 *  3. Assign Customers — bulk-move existing customers onto this agent.
 * Also shows the agent's currently-managed customer list for context.
 */
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { findAgentDetailById } from "@/server/repositories/agent.repository";
import { listCustomersNotAssignedToAgent } from "@/server/repositories/customer.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EditAgentForm } from "@/components/forms/EditAgentForm";
import { ToggleAgentActiveButton } from "@/components/forms/ToggleAgentActiveButton";
import { AssignCustomersForm } from "@/components/forms/AssignCustomersForm";
import Link from "next/link";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/reconciliations", label: "Reconciliations" },
  { href: "/admin/reports", label: "Reports" },
];

export default async function AdminAgentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("ADMIN");
  const { id } = await params;

  const agent = await findAgentDetailById(id);
  if (!agent) {
    notFound();
  }

  const unassignedCandidates = await listCustomersNotAssignedToAgent(id);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{agent.name}</h2>
            <p className="text-sm text-gray-500">
              Agent profile, status, and customer assignment
            </p>
          </div>
          <Badge tone={agent.isActive ? "green" : "red"}>
            {agent.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Edit form */}
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Edit Agent
            </h3>
            <EditAgentForm
              agent={{ id: agent.id, name: agent.name, email: agent.email, phone: agent.phone }}
            />
          </Card>

          {/* Status control */}
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Account Status
            </h3>
            <p className="mb-4 text-sm text-gray-600">
              {agent.isActive
                ? "This agent can currently log in and manage their customers."
                : "This agent is deactivated and cannot log in until reactivated."}
            </p>
            <ToggleAgentActiveButton
              agentId={agent.id}
              isActive={agent.isActive}
              managedCustomerCount={agent.managedCustomers.length}
            />
          </Card>

          {/* Assign customers */}
          <Card className="lg:col-span-2">
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Assign Customers to This Agent
            </h3>
            <AssignCustomersForm agentId={agent.id} candidates={unassignedCandidates} />
          </Card>

          {/* Currently managed customers */}
          <Card className="overflow-x-auto p-0 lg:col-span-2">
            <h3 className="px-6 pt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Currently Managed Customers ({agent.managedCustomers.length})
            </h3>
            {agent.managedCustomers.length === 0 ? (
              <p className="p-6 text-center text-gray-500">No customers assigned yet.</p>
            ) : (
              <table className="mt-4 w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                  <tr>
                    <th className="px-6 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {agent.managedCustomers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="px-6 py-3 font-medium text-gray-900">{customer.user.name}</td>
                      <td className="px-4 py-3 text-gray-600">{customer.user.phone ?? "—"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={customer.user.isActive ? "green" : "red"}>
                          {customer.user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link
                          href={`/admin/customers/${customer.id}`}
                          className="text-sm font-medium text-emerald-700 hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
