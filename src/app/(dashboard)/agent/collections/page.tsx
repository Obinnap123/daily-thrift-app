/**
 * Agent > Today's Collections.
 *
 * A payment transaction and a funded calendar day are intentionally
 * separate concepts. One payment can fund several future calendar days,
 * so this screen resolves today's state from ContributionAllocation first
 * and uses today's Contribution row only as secondary activity context.
 */
import Link from "next/link";
import { requireRole } from "@/lib/session";
import { listCustomerProfiles } from "@/server/repositories/customer.repository";
import { listActivePlansForAgent } from "@/server/repositories/contribution-plan.repository";
import { today } from "@/lib/date";
import {
  resolveCollectionDayState,
  type CollectionDayState,
} from "@/lib/collection-day-state";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { RecordContributionForm } from "@/components/forms/RecordContributionForm";
import { QuickPayButton } from "@/components/forms/QuickPayButton";

const AGENT_NAV_LINKS = [
  { href: "/agent", label: "Overview" },
  { href: "/agent/collections", label: "Today's Collections" },
  { href: "/agent/reconciliation", label: "End-of-Day Report" },
];

type AgentPlan = Awaited<ReturnType<typeof listActivePlansForAgent>>[number];

function getTodayState(plan: AgentPlan, businessDate: Date): CollectionDayState {
  return resolveCollectionDayState({
    businessDate,
    planStartDate: plan.startDate,
    hasCoverageAllocation: Boolean(plan.allocations[0]),
    coveragePaymentDate: plan.allocations[0]?.contribution?.collectionDate,
    contributionStatus: plan.contributions[0]?.status,
  });
}

function TodayOutcome({ plan, businessDate }: { plan: AgentPlan; businessDate: Date }) {
  const state = getTodayState(plan, businessDate);

  if (state === "NOT_STARTED") {
    return (
      <div className="space-y-1">
        <Badge>Not started</Badge>
        <p className="text-xs text-ink-muted">
          Starts {plan.startDate.toLocaleDateString("en-GB", { timeZone: "UTC" })}
        </p>
      </div>
    );
  }

  if (state === "COVERED_TODAY" || state === "COVERED_IN_ADVANCE") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="green">
          {state === "COVERED_IN_ADVANCE" ? "Covered in advance" : "Covered today"}
        </Badge>
        {(
          <QuickPayButton
            customers={[{
              id: plan.customerProfileId,
              name: plan.customerProfile.user.name,
              phone: plan.customerProfile.user.phone,
              customerCode: plan.customerProfile.customerCode,
            }]}
            isAdmin={false}
            initialCustomerProfileId={plan.customerProfileId}
            label="Record More"
            variant="secondary"
            size="sm"
          />
        )}
      </div>
    );
  }

  if (state === "PAYMENT_RECORDED_UNCOVERED") {
    return (
      <div className="space-y-1">
        <Badge tone="amber">Payment recorded</Badge>
        <p className="max-w-xs text-xs text-ink-muted">
          Today remains unfunded because this payment covered an older outstanding date.
        </p>
        <QuickPayButton
          customers={[{
            id: plan.customerProfileId,
            name: plan.customerProfile.user.name,
            phone: plan.customerProfile.user.phone,
            customerCode: plan.customerProfile.customerCode,
          }]}
          isAdmin={false}
          initialCustomerProfileId={plan.customerProfileId}
          label="Record More"
          variant="secondary"
          size="sm"
        />
      </div>
    );
  }

  if (state === "MISSED_RECORDED") {
    return <Badge tone="red">Missed — recorded</Badge>;
  }

  return (
    <RecordContributionForm
      customerProfileId={plan.customerProfileId}
      defaultAmount={Number(plan.dailyAmount)}
    />
  );
}

export default async function AgentCollectionsPage() {
  const user = await requireRole("AGENT");
  const businessDate = today();

  const [plans, allCustomers] = await Promise.all([
    listActivePlansForAgent(user.id, businessDate),
    listCustomerProfiles({ agentId: user.id }),
  ]);

  const activePlanCustomerIds = new Set(plans.map((plan) => plan.customerProfileId));
  const customersWithoutActivePlan = allCustomers.filter(
    (customer) => customer.user.isActive && !activePlanCustomerIds.has(customer.id),
  );

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Agent Dashboard" />
      <DashboardNav links={AGENT_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-ink">Today&apos;s Collections</h2>
          <p className="text-sm text-ink-muted">
            Review each customer&apos;s coverage for {businessDate.toLocaleDateString("en-GB", { timeZone: "UTC" })}.
            Prepaid days are shown as covered and cannot be marked missed.
          </p>
        </div>

        <Card className="p-0">
          {plans.length === 0 ? (
            <p className="p-6 text-center text-ink-muted">
              None of your customers have an active savings period yet.
            </p>
          ) : (
            <>
              <div className="divide-y divide-line md:hidden">
                {plans.map((plan) => (
                  <article key={plan.id} className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink">{plan.customerProfile.user.name}</h3>
                        <p className="text-sm text-ink-muted">
                          {plan.customerProfile.user.phone ?? "No phone number"}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold text-ink">
                        ₦{Number(plan.dailyAmount).toLocaleString()}/day
                      </p>
                    </div>
                    <TodayOutcome plan={plan} businessDate={businessDate} />
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-surface-muted text-ink-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium">Daily Amount</th>
                      <th className="px-4 py-3 font-medium">Today&apos;s Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {plans.map((plan) => (
                      <tr key={plan.id}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-ink">{plan.customerProfile.user.name}</p>
                          <p className="text-xs text-ink-muted">
                            {plan.customerProfile.user.phone ?? "No phone number"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          ₦{Number(plan.dailyAmount).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <TodayOutcome plan={plan} businessDate={businessDate} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {customersWithoutActivePlan.length > 0 && (
          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
              No Active Savings Period ({customersWithoutActivePlan.length})
            </h3>
            <p className="mb-4 text-sm text-ink-muted">
              A customer who has completed a payout can begin again immediately—the first new
              payment opens their next savings period automatically.
            </p>
            <ul className="divide-y divide-line">
              {customersWithoutActivePlan.map((customer) => {
                const hasPreviousPeriod = Boolean(customer.contributionPlans[0]);
                const customerOption = {
                  id: customer.id,
                  name: customer.user.name,
                  phone: customer.user.phone,
                  customerCode: customer.customerCode,
                };
                return (
                  <li
                    key={customer.id}
                    className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-ink">{customer.user.name}</p>
                      <p className="text-sm text-ink-muted">{customer.user.phone ?? "No phone number"}</p>
                    </div>
                    {hasPreviousPeriod ? (
                      <QuickPayButton
                        customers={[customerOption]}
                        isAdmin={false}
                        initialCustomerProfileId={customer.id}
                        label="Record First Payment"
                        size="sm"
                      />
                    ) : (
                      <Link
                        href={`/agent/customers/${customer.id}`}
                        className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface-hover sm:min-h-0"
                      >
                        Start Savings Plan
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Link href="/agent" className="text-sm font-medium text-brand-ink hover:underline">
          &larr; Back to overview
        </Link>
      </main>
    </div>
  );
}
