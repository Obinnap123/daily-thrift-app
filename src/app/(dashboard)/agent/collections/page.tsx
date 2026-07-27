/**
 * Agent > Today's Collections.
 * ----------------------------------------------------------------------------
 * One row per customer who has an ACTIVE savings plan, each with an inline
 * RecordContributionForm so the agent can log COLLECTED/MISSED for today in
 * a single click per customer. A row that already has today's Contribution
 * recorded shows a read-only "already recorded" summary instead of the form
 * — this is what actually enforces (at the UI level; the real enforcement
 * is the @@unique([contributionPlanId, collectionDate]) DB constraint and
 * the duplicate check in recordContribution()) that a customer can't be
 * visited twice in the same day.
 *
 * Customers with NO active plan yet are also listed, but only with a note
 * pointing the agent to the customer's profile page to start one — you
 * cannot record a contribution against a plan that doesn't exist.
 */
import { requireRole } from "@/lib/session";
import { listCustomerProfiles } from "@/server/repositories/customer.repository";
import { listActivePlansForAgent } from "@/server/repositories/contribution-plan.repository";
import { today } from "@/lib/date";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RecordContributionForm } from "@/components/forms/RecordContributionForm";
import Link from "next/link";

const AGENT_NAV_LINKS = [
  { href: "/agent", label: "Overview" },
  { href: "/agent/collections", label: "Today's Collections" },
  { href: "/agent/reconciliation", label: "End-of-Day Report" },
];

export default async function AgentCollectionsPage() {
  const user = await requireRole("AGENT");

  const [plans, allCustomers] = await Promise.all([
    listActivePlansForAgent(user.id, today()),
    listCustomerProfiles({ agentId: user.id }),
  ]);

  // Customers with no ACTIVE plan (new registrations, or a previous cycle
  // already PAID_OUT) — can't record a contribution until a plan exists.
  const activePlanCustomerIds = new Set(plans.map((plan) => plan.customerProfileId));
  const customersWithoutActivePlan = allCustomers.filter(
    (customer) => customer.user.isActive && !activePlanCustomerIds.has(customer.id)
  );

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Agent Dashboard" />
      <DashboardNav links={AGENT_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Today&apos;s Collections</h2>
          <p className="text-sm text-gray-500">
            Record each customer&apos;s outcome for {today().toLocaleDateString()}. Once saved,
            a day cannot be recorded twice.
          </p>
        </div>

        <Card className="overflow-x-auto p-0">
          {plans.length === 0 ? (
            <p className="p-6 text-center text-gray-500">
              None of your customers have an active savings plan yet.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Daily Amount</th>
                  <th className="px-4 py-3 font-medium">Today&apos;s Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {plans.map((plan) => {
                  const todaysContribution = plan.contributions[0];
                  return (
                    <tr key={plan.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {plan.customerProfile.user.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {plan.customerProfile.user.phone ?? "—"}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        ₦{Number(plan.dailyAmount).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {todaysContribution ? (
                          <Badge tone={todaysContribution.status === "COLLECTED" ? "green" : "red"}>
                            {todaysContribution.status === "COLLECTED"
                              ? `Collected — ₦${Number(todaysContribution.amount ?? 0).toLocaleString()}`
                              : "Missed"}
                          </Badge>
                        ) : (
                          <RecordContributionForm
                            customerProfileId={plan.customerProfileId}
                            defaultAmount={Number(plan.dailyAmount)}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>

        {customersWithoutActivePlan.length > 0 && (
          <Card>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
              No Active Savings Plan ({customersWithoutActivePlan.length})
            </h3>
            <p className="mb-3 text-sm text-gray-500">
              These customers have no active savings cycle, so nothing can be recorded for them
              yet. Visit each customer&apos;s profile (via Admin) to start a plan.
            </p>
            <ul className="divide-y divide-gray-100">
              {customersWithoutActivePlan.map((customer) => (
                <li key={customer.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="font-medium text-gray-900">{customer.user.name}</span>
                  <span className="text-gray-500">{customer.user.phone ?? "—"}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Link href="/agent" className="text-sm font-medium text-emerald-700 hover:underline">
          &larr; Back to overview
        </Link>
      </main>
    </div>
  );
}
