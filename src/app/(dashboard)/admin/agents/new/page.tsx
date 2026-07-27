/**
 * Admin > Create Agent page.
 */
import { requireRole } from "@/lib/session";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { CreateAgentForm } from "./CreateAgentForm";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
];

export default async function NewAgentPage() {
  await requireRole("ADMIN");

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-lg">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Create Agent</h2>
          <Card>
            <CreateAgentForm />
          </Card>
        </div>
      </main>
    </div>
  );
}
