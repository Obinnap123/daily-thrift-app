/**
 * Admin > Agents list.
 * Shows agents with search (name/email/phone), status filter, and
 * pagination — all applied at the database level via
 * listAgentsPaginated(). Each row links to the Agent detail page, where
 * an Admin can edit the agent, activate/deactivate them, and assign
 * customers to them.
 */
import { requireRole } from "@/lib/session";
import { listAgentsPaginated } from "@/server/repositories/agent.repository";
import { parsePageParam } from "@/lib/pagination";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { SearchFilterBar } from "@/components/ui/SearchFilterBar";
import Link from "next/link";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
];

interface AdminAgentsPageProps {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}

export default async function AdminAgentsPage({ searchParams }: AdminAgentsPageProps) {
  await requireRole("ADMIN");

  const params = await searchParams;
  const page = parsePageParam(params.page);
  const status = params.status === "active" || params.status === "inactive" ? params.status : undefined;

  const { agents, totalCount } = await listAgentsPaginated({
    search: params.q,
    status,
    page,
  });
  const pageCount = Math.max(1, Math.ceil(totalCount / 10));

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Agents ({totalCount})</h2>
          <Link
            href="/admin/agents/new"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + Add Agent
          </Link>
        </div>

        <SearchFilterBar
          placeholder="Search by name, email, or phone…"
          statusOptions={[
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
          ]}
        />

        <Card className="overflow-x-auto p-0">
          {agents.length === 0 ? (
            <p className="p-6 text-center text-gray-500">
              {params.q || status
                ? "No agents match your search/filter."
                : "No agents yet. Add your first agent to start assigning customers."}
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
                  <th className="px-4 py-3 font-medium"></th>
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
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/agents/${agent.id}`}
                        className="text-sm font-medium text-emerald-700 hover:underline"
                      >
                        View / Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination
            currentPage={page}
            totalPages={pageCount}
            searchParams={params}
            basePath="/admin/agents"
          />
        </Card>
      </main>
    </div>
  );
}
