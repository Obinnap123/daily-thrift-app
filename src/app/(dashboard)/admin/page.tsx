/**
 * Admin dashboard home.
 * ----------------------------------------------------------------------------
 * The Admin's single-page overview of the whole system: headline counts,
 * today/this-week/this-month collection totals, customers due for payout,
 * missed payments today, and two activity feeds (recent transactions,
 * recent agent activity). Every number here is a live aggregate — nothing
 * cached — computed via the same repository functions the Agent dashboard
 * and Reports module use, so the definition of each metric never drifts
 * between pages.
 */
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import {
  listRecentContributionsSystemWide,
  getDashboardContributionSummary,
} from "@/server/repositories/contribution.repository";
import { listPlansReadyForPayout } from "@/server/repositories/contribution-plan.repository";
import { listRecentAgentAssignmentLogs } from "@/server/repositories/agent.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MonthlyTrackerGrid } from "@/components/dashboard/MonthlyTrackerGrid";
import { PayoutRow } from "@/components/forms/PayoutRow";
import { QuickPayButton } from "@/components/forms/QuickPayButton";
import { format } from "date-fns";
import Link from "next/link";
import { getFinancialOverview } from "@/server/repositories/financial.repository";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/tracking", label: "Tracking" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/reconciliations", label: "Reconciliations" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/audit", label: "Audit Log" },
  { href: "/admin/settings", label: "Settings" },
];

export default async function AdminDashboardPage() {
  await requireRole("ADMIN");

  const [
    userGroups,
    activity,
    dueForPayout,
    recentTransactions,
    recentAgentActivity,
    financial,
  ] = await Promise.all([
    prisma.user.groupBy({ by: ["role", "isActive"], _count: { _all: true } }),
    getDashboardContributionSummary(),
    listPlansReadyForPayout(),
    listRecentContributionsSystemWide(8),
    listRecentAgentAssignmentLogs(8),
    getFinancialOverview(),
  ]);

  const totalCustomers = userGroups.filter((row) => row.role === "CUSTOMER").reduce((sum, row) => sum + row._count._all, 0);
  const activeCustomers = userGroups.find((row) => row.role === "CUSTOMER" && row.isActive)?._count._all ?? 0;
  const totalAgents = userGroups.filter((row) => row.role === "AGENT").reduce((sum, row) => sum + row._count._all, 0);
  const { totalToday, totalWeek, totalMonth, missedToday, trackingSeries } = activity;

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Lifetime Collections" value={`₦${financial.lifetimeCollections.toLocaleString()}`} />
          <StatCard label="Active Customer Savings" value={`₦${financial.activeSavings.toLocaleString()}`} tone="amber" />
          <StatCard label="Paid to Customers" value={`₦${financial.paidToCustomers.toLocaleString()}`} tone="green" />
          <StatCard label="Commission Earned" value={`₦${financial.commissionEarned.toLocaleString()}`} tone="green" />
          <StatCard label="Total Customers" value={totalCustomers} />
          <StatCard label="Active Customers" value={activeCustomers} tone="green" />
          <StatCard label="Total Agents" value={totalAgents} />
          <StatCard label="Missed Payments Today" value={missedToday} tone="red" />
          <StatCard label="Collections Today" value={`₦${totalToday.toLocaleString()}`} />
          <StatCard label="Collections This Week" value={`₦${totalWeek.toLocaleString()}`} />
          <StatCard label="Collections This Month" value={`₦${totalMonth.toLocaleString()}`} />
          <StatCard label="Due For Payout" value={dueForPayout.length} tone="amber" />
        </div>

        <Card>
          <h2 className="mb-3 text-base font-semibold text-gray-900">Quick actions</h2>
          <div className="flex flex-wrap gap-3">
            <QuickPayButton isAdmin label="Quick Pay" />
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
            <Link
              href="/admin/payouts"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View Payouts ({dueForPayout.length} ready)
            </Link>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Quick Pay — Ready for Payout ({dueForPayout.length})
            </h3>
            <Link
              href="/admin/payouts"
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              Full payouts list &rarr;
            </Link>
          </div>
          <p className="mb-3 text-sm text-gray-500">
            Record a completed savings cycle&apos;s payout in one click, right from here — no
            need to open the Payouts page first. Only pay after the cash has been physically
            handed over or the bank transfer has been completed outside this system.
          </p>
          {dueForPayout.length === 0 ? (
            <p className="text-sm text-gray-500">No customers are currently ready for payout.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {dueForPayout.slice(0, 5).map((plan) => (
                <li
                  key={plan.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      {plan.customerProfile.user.name}
                    </span>
                    <span className="ml-2 text-gray-500">
                      ₦{Number(plan.dailyAmount).toLocaleString()}/day
                    </span>
                  </div>
                  <PayoutRow
                    contributionPlanId={plan.id}
                    customerName={plan.customerProfile.user.name}
                    dailyAmount={Number(plan.dailyAmount)}
                    durationDays={plan.durationDays}
                  />
                </li>
              ))}
            </ul>
          )}
          {dueForPayout.length > 5 && (
            <p className="mt-3 text-xs text-gray-500">
              +{dueForPayout.length - 5} more on the{" "}
              <Link href="/admin/payouts" className="font-medium text-emerald-700 hover:underline">
                full Payouts page
              </Link>
              .
            </p>
          )}
        </Card>

        <Card>
          <MonthlyTrackerGrid
            title="31-Day Tracking (System-Wide)"
            subtitle="Every day's collection activity across all agents, most recent 31 days."
            series={trackingSeries}
          />
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Recent Transactions
            </h3>
            {recentTransactions.length === 0 ? (
              <p className="text-sm text-gray-500">No contributions recorded yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentTransactions.map((contribution) => (
                  <li key={contribution.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-gray-900">
                        {contribution.customerProfile.user.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        by {contribution.collectedBy.name} ·{" "}
                        {format(contribution.createdAt, "dd MMM yyyy, h:mm a")}
                      </p>
                    </div>
                    <Badge tone={contribution.status === "COLLECTED" ? "green" : "red"}>
                      {contribution.status === "COLLECTED"
                        ? `₦${Number(contribution.amount ?? 0).toLocaleString()}`
                        : "Missed"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Recent Agent Activities
            </h3>
            {recentAgentActivity.length === 0 ? (
              <p className="text-sm text-gray-500">No agent assignment activity yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recentAgentActivity.map((log) => (
                  <li key={log.id} className="py-2.5 text-sm">
                    <p className="font-medium text-gray-900">
                      {log.previousAgent
                        ? `${log.previousAgent.name} → ${log.newAgent.name}`
                        : `Assigned to ${log.newAgent.name}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      {log.customerProfile.user.name} · by {log.changedBy.name} ·{" "}
                      {format(log.createdAt, "dd MMM yyyy, h:mm a")}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "green" | "red" | "amber";
}) {
  const toneClass =
    tone === "green"
      ? "text-emerald-700"
      : tone === "red"
        ? "text-red-700"
        : tone === "amber"
          ? "text-amber-700"
          : "text-gray-900";
  return (
    <Card>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</p>
    </Card>
  );
}
