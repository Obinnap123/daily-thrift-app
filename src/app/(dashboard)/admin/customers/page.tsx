/**
 * Admin > Customers list.
 * Shows every customer in the system with their assigned agent — Admin has
 * full visibility across all agents (unlike the Agent dashboard, which only
 * shows that agent's own customers).
 */
import { requireRole } from "@/lib/session";
import { listCustomerProfiles } from "@/server/repositories/customer.repository";
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

export default async function AdminCustomersPage() {
  await requireRole("ADMIN");

  const customers = await listCustomerProfiles();

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Customers ({customers.length})
          </h2>
          <Link
            href="/admin/customers/new"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + Register Customer
          </Link>
        </div>

        <Card className="overflow-x-auto p-0">
          {customers.length === 0 ? (
            <p className="p-6 text-center text-gray-500">
              No customers registered yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">ID Number</th>
                  <th className="px-4 py-3 font-medium">Assigned Agent</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {customer.user.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{customer.user.phone}</td>
                    <td className="px-4 py-3 text-gray-600">{customer.idNumber}</td>
                    <td className="px-4 py-3 text-gray-600">{customer.assignedAgent.name}</td>
                    <td className="px-4 py-3">
                      <Badge tone={customer.user.isActive ? "green" : "red"}>
                        {customer.user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
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
      </main>
    </div>
  );
}
