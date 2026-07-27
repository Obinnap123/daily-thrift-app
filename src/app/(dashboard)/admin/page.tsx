/**
 * Admin dashboard home.
 * Shows quick counts and links into the two management areas: Agents and
 * Customers. Full reports/analytics come in a later step.
 */
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import Link from "next/link";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
];

export default async function AdminDashboardPage() {
  await requireRole("ADMIN");

  const [agentCount, customerCount, activeAgentCount] = await Promise.all([
    prisma.user.count({ where: { role: "AGENT" } }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.user.count({ where: { role: "AGENT", isActive: true } }),
  ]);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="Total Agents" value={agentCount} />
          <StatCard label="Active Agents" value={activeAgentCount} />
          <StatCard label="Total Customers" value={customerCount} />
        </div>

        <Card>
          <h2 className="mb-3 text-base font-semibold text-gray-900">Quick actions</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/agents/new"
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              + Create Agent
            </Link>
            <Link
              href="/admin/customers/new"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              + Register Customer
            </Link>
          </div>
        </Card>
      </main>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
    </Card>
  );
}
