/**
 * Admin > Agents list.
 * Shows every agent in the system with their active/inactive status and how
 * many customers are currently assigned to them.
 */
import { requireRole } from "@/lib/session";
import { listAllAgents } from "@/server/repositories/agent.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Link from "next/link";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
];

export default async function AdminAgentsPage() {
  await requireRole("ADMIN");

  const agents = await listAllAgents();

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Agents ({agents.length})</h2>
          <Link
            href="/admin/agents/new"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + Create Agent
          </Link>
        </div>

        <Card className="overflow-x-auto p-0">
          {agents.length === 0 ? (
            <p className="p-6 text-center text-gray-500">
              No agents yet. Create your first agent to start assigning customers.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">Customers</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">{agent.name}</td>
                    <td className="px-4 py-3 text-gray-600">{agent.email}</td>
                    <td className="px-4 py-3 text-gray-600">{agent.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-600">{agent._count.managedCustomers}</td>
                    <td className="px-4 py-3">
                      <Badge tone={agent.isActive ? "green" : "red"}>
                        {agent.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </main>
    </div>
  );
}
