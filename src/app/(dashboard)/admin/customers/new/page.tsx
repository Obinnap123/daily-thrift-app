/**
 * Admin > Register Customer page.
 * Admin can assign the new customer to any active agent.
 */
import { requireRole } from "@/lib/session";
import { listActiveAgents } from "@/server/repositories/agent.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { RegisterCustomerForm } from "@/components/forms/RegisterCustomerForm";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
];

export default async function AdminNewCustomerPage() {
  await requireRole("ADMIN");

  const agents = await listActiveAgents();

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-lg">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Register Customer</h2>
          {agents.length === 0 ? (
            <Card>
              <p className="text-gray-600">
                You need to create at least one agent before registering a
                customer, since every customer must be assigned to an agent.
              </p>
            </Card>
          ) : (
            <Card>
              <RegisterCustomerForm redirectTo="/admin/customers" agents={agents} />
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
