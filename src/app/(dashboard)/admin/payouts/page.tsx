/**
 * Admin > Maturity / Payout module.
 * ----------------------------------------------------------------------------
 * Two sections on one page:
 *  1. "Ready for Payout" — plans that have reached COMPLETED (all required
 *     days paid) and have no Payout yet. Each row shows total savings +
 *     the plan's reference maturity date, with an inline RecordPayoutForm
 *     that both records the manual payout and marks the account Paid.
 *  2. "Payout History" — every payout ever recorded, paginated, searchable
 *     by receipt number / customer name / code — this is also the data
 *     Reports > Payout History reuses.
 *
 * No online payment integration anywhere on this page — see
 * RecordPayoutForm.tsx / payout.service.ts for where that's enforced.
 */
import { requireRole } from "@/lib/session";
import { listPlansReadyForPayout } from "@/server/repositories/contribution-plan.repository";
import { listPayoutsPaginated } from "@/server/repositories/payout.repository";
import { parsePageParam, totalPages } from "@/lib/pagination";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { PayoutRow } from "@/components/forms/PayoutRow";
import { format } from "date-fns";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/reconciliations", label: "Reconciliations" },
  { href: "/admin/reports", label: "Reports" },
];

interface AdminPayoutsPageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function AdminPayoutsPage({ searchParams }: AdminPayoutsPageProps) {
  await requireRole("ADMIN");

  const params = await searchParams;
  const page = parsePageParam(params.page);

  const [readyPlans, { payouts, totalCount }] = await Promise.all([
    listPlansReadyForPayout(),
    listPayoutsPaginated({ search: params.q, page }),
  ]);
  const pageCount = totalPages(totalCount);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Ready for Payout ({readyPlans.length})
          </h2>
          <p className="text-sm text-gray-500">
            Customers whose savings cycle is complete. Pay them manually (cash or bank transfer)
            outside this system first, then record the payout here.
          </p>
        </div>

        <Card className="overflow-x-auto p-0">
          {readyPlans.length === 0 ? (
            <p className="p-6 text-center text-gray-500">
              No customers are currently ready for payout.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Daily Amount</th>
                  <th className="px-4 py-3 font-medium">Reference Maturity Date</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {readyPlans.map((plan) => (
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
                    <td className="px-4 py-3 text-gray-600">
                      {format(plan.expectedMaturityDate, "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3">
                      <PayoutRow
                        contributionPlanId={plan.id}
                        customerName={plan.customerProfile.user.name}
                        dailyAmount={Number(plan.dailyAmount)}
                        durationDays={plan.durationDays}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <div>
          <h2 className="text-lg font-semibold text-gray-900">Payout History ({totalCount})</h2>
          <p className="text-sm text-gray-500">Every payout ever recorded, most recent first.</p>
        </div>

        <Card className="overflow-x-auto p-0">
          {payouts.length === 0 ? (
            <p className="p-6 text-center text-gray-500">No payouts recorded yet.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Receipt #</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Total Savings</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Payout Date</th>
                  <th className="px-4 py-3 font-medium">Approved By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">
                      {payout.receiptNumber}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {payout.customerProfile.user.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      ₦{Number(payout.totalSavings).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {payout.payoutMethod === "CASH" ? "Cash" : "Bank Transfer"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {format(payout.payoutDate, "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{payout.approvedBy.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <Pagination
            currentPage={page}
            totalPages={pageCount}
            searchParams={params}
            basePath="/admin/payouts"
          />
        </Card>
      </main>
    </div>
  );
}
