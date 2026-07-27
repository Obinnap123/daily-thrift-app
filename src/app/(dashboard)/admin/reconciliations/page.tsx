/**
 * Admin > End-of-Day Reconciliation review queue.
 * ----------------------------------------------------------------------------
 * Lists submitted daily cash reports across all agents, newest first, with
 * an optional status filter (defaults to showing everything). SUBMITTED
 * rows get Approve/Reject controls; APPROVED/REJECTED rows are read-only
 * history with the reviewer's name and note.
 */
import { requireRole } from "@/lib/session";
import { listReconciliationsPaginated } from "@/server/repositories/reconciliation.repository";
import { parsePageParam, totalPages } from "@/lib/pagination";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { ReviewReconciliationButtons } from "@/components/forms/ReviewReconciliationButtons";
import { format } from "date-fns";

const ADMIN_NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/customers", label: "Customers" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/reconciliations", label: "Reconciliations" },
  { href: "/admin/reports", label: "Reports" },
];

const STATUS_TONE = { SUBMITTED: "amber", APPROVED: "green", REJECTED: "red" } as const;

interface AdminReconciliationsPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function AdminReconciliationsPage({
  searchParams,
}: AdminReconciliationsPageProps) {
  await requireRole("ADMIN");

  const params = await searchParams;
  const page = parsePageParam(params.page);
  const status =
    params.status === "SUBMITTED" || params.status === "APPROVED" || params.status === "REJECTED"
      ? params.status
      : undefined;

  const { reports, totalCount } = await listReconciliationsPaginated({ status, page });
  const pageCount = totalPages(totalCount);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Admin Dashboard" />
      <DashboardNav links={ADMIN_NAV_LINKS} />
      <main className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Daily Collection Reports ({totalCount})
          </h2>
          <div className="flex gap-1 text-sm">
            {(["SUBMITTED", "APPROVED", "REJECTED"] as const).map((option) => (
              <a
                key={option}
                href={`/admin/reconciliations?status=${option}`}
                className={`rounded-lg px-3 py-1.5 font-medium ${
                  status === option
                    ? "bg-emerald-600 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {option}
              </a>
            ))}
            <a
              href="/admin/reconciliations"
              className={`rounded-lg px-3 py-1.5 font-medium ${
                !status ? "bg-emerald-600 text-white" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              All
            </a>
          </div>
        </div>

        <Card className="overflow-x-auto p-0">
          {reports.length === 0 ? (
            <p className="p-6 text-center text-gray-500">No reports found.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Expected</th>
                  <th className="px-4 py-3 font-medium">Actual</th>
                  <th className="px-4 py-3 font-medium">Discrepancy</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map((report) => {
                  const discrepancy = Number(report.actualCash) - Number(report.expectedCash);
                  return (
                    <tr key={report.id}>
                      <td className="px-4 py-3 font-medium text-gray-900">{report.agent.name}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {format(report.reconciliationDate, "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        ₦{Number(report.expectedCash).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        ₦{Number(report.actualCash).toLocaleString()}
                      </td>
                      <td
                        className={`px-4 py-3 ${
                          discrepancy < 0 ? "text-red-600" : discrepancy > 0 ? "text-amber-600" : "text-gray-500"
                        }`}
                      >
                        {discrepancy === 0 ? "—" : `₦${discrepancy.toLocaleString()}`}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[report.status]}>{report.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {report.status === "SUBMITTED" ? (
                          <ReviewReconciliationButtons reconciliationId={report.id} />
                        ) : (
                          <span className="text-xs text-gray-500">
                            {report.reviewedBy?.name ?? "—"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <Pagination
            currentPage={page}
            totalPages={pageCount}
            searchParams={params}
            basePath="/admin/reconciliations"
          />
        </Card>
      </main>
    </div>
  );
}
