/**
 * Agent dashboard home — Agent Collection Summary.
 * ----------------------------------------------------------------------------
 * Shows this agent's own daily collection numbers: how many of their
 * customers are assigned/visited today, how much was collected today/this
 * week/this month, outstanding collections, and which customers they
 * haven't visited yet today. Every number here is a direct aggregate over
 * the `contributions` table (see contribution.repository.ts) — nothing is
 * separately tracked or cached, so it can never drift out of sync.
 */
import { requireRole } from "@/lib/session";
import { listCustomerProfiles } from "@/server/repositories/customer.repository";
import { listActivePlansForAgent } from "@/server/repositories/contribution-plan.repository";
import {
  sumCollectedByAgent,
  countByAgentAndDate,
  sumOutstandingForAgent,
  getDailyTrackingSeries,
} from "@/server/repositories/contribution.repository";
import { today, weekRange, monthRange } from "@/lib/date";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { MonthlyTrackerGrid } from "@/components/dashboard/MonthlyTrackerGrid";
import { RecordContributionForm } from "@/components/forms/RecordContributionForm";
import { QuickPayButton } from "@/components/forms/QuickPayButton";
import Link from "next/link";

const AGENT_NAV_LINKS = [
  { href: "/agent", label: "Overview" },
  { href: "/agent/collections", label: "Today's Collections" },
  { href: "/agent/reconciliation", label: "End-of-Day Report" },
];

export default async function AgentDashboardPage() {
  const user = await requireRole("AGENT");

  const [
    myCustomers,
    todayCounts,
    totalToday,
    totalWeek,
    totalMonth,
    outstanding,
    activePlansToday,
    trackingSeries,
  ] = await Promise.all([
    listCustomerProfiles({ agentId: user.id }),
    countByAgentAndDate(user.id, today()),
    sumCollectedByAgent(user.id, { start: today(), end: today() }),
    sumCollectedByAgent(user.id, weekRange()),
    sumCollectedByAgent(user.id, monthRange()),
    sumOutstandingForAgent(user.id),
    listActivePlansForAgent(user.id, today()),
    getDailyTrackingSeries({ agentId: user.id }), // this agent's last 31 days
  ]);

  const activeCustomerCount = myCustomers.filter((c) => c.user.isActive).length;

  // Quick Pay (inline widget): every customer with an ACTIVE plan who
  // hasn't had today's outcome recorded yet — same underlying data as
  // /agent/collections, just surfaced directly on the dashboard so an
  // agent doesn't have to navigate away to record the common case in one
  // click.
  const notYetRecordedToday = activePlansToday.filter((plan) => !plan.contributions[0]);

  // Quick Pay (modal): the searchable customer dropdown covers EVERY one
  // of this agent's customers, not just those not-yet-recorded-today — the
  // modal is the general-purpose entry point (any customer, any time,
  // including an Admin-approved same-day override), distinct from the
  // inline widget above which only covers the common "hasn't paid yet
  // today" case.
  const quickPayCustomers = myCustomers.map((customer) => ({
    id: customer.id,
    name: customer.user.name,
    phone: customer.user.phone,
    customerCode: customer.customerCode,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Agent Dashboard" />
      <DashboardNav links={AGENT_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Daily Collection Summary</h2>
            <p className="text-sm text-gray-500">
              Your collection activity and totals for {today().toLocaleDateString()}.
            </p>
          </div>
          <QuickPayButton customers={quickPayCustomers} isAdmin={false} label="Quick Pay" />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard label="Customers Assigned" value={activeCustomerCount} />
          <StatCard label="Visited Today" value={todayCounts.visited} />
          <StatCard label="Collected Today" value={todayCounts.collected} tone="green" />
          <StatCard label="Missed Today" value={todayCounts.missed} tone="red" />
          <StatCard label="Total Collected Today" value={`₦${totalToday.toLocaleString()}`} />
          <StatCard label="Total This Week" value={`₦${totalWeek.toLocaleString()}`} />
          <StatCard label="Total This Month" value={`₦${totalMonth.toLocaleString()}`} />
          <StatCard label="Outstanding Collections" value={`₦${outstanding.toLocaleString()}`} tone="amber" />
        </div>

        <Card>
          <MonthlyTrackerGrid
            title="31-Day Tracking"
            subtitle="Your collection activity for the most recent 31 days."
            series={trackingSeries}
          />
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Quick Pay — Not Yet Recorded Today ({notYetRecordedToday.length})
            </h3>
            <Link
              href="/agent/collections"
              className="text-sm font-medium text-emerald-700 hover:underline"
            >
              Full collections list &rarr;
            </Link>
          </div>
          <p className="mb-3 text-sm text-gray-500">
            Record today&apos;s outcome for a customer in one click, right from here — no need to
            open Today&apos;s Collections first.
          </p>
          {notYetRecordedToday.length === 0 ? (
            <p className="text-sm text-gray-500">
              Every customer with an active plan has been recorded for today. Great work!
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {notYetRecordedToday.map((plan) => (
                <li
                  key={plan.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div>
                    <span className="font-medium text-gray-900">
                      {plan.customerProfile.user.name}
                    </span>
                    <span className="ml-2 text-gray-500">
                      {plan.customerProfile.user.phone ?? "—"}
                    </span>
                  </div>
                  <RecordContributionForm
                    customerProfileId={plan.customerProfileId}
                    defaultAmount={Number(plan.dailyAmount)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            My Customers ({myCustomers.length})
          </h3>
          <Link
            href="/agent/customers/new"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            + Register Customer
          </Link>
        </div>

        <Card className="overflow-x-auto p-0">
          {myCustomers.length === 0 ? (
            <p className="p-6 text-center text-gray-500">
              You don&apos;t have any customers assigned to you yet. Register
              your first customer to get started.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Phone</th>
                  <th className="px-4 py-3 font-medium">ID Number</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {myCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {customer.user.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{customer.user.phone}</td>
                    <td className="px-4 py-3 text-gray-600">{customer.idNumber}</td>
                    <td className="px-4 py-3">
                      <Badge tone={customer.user.isActive ? "green" : "red"}>
                        {customer.user.isActive ? "Active" : "Inactive"}
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
