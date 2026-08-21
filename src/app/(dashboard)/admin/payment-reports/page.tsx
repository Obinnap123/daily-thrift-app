import Link from "next/link";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { parsePageParam, totalPages } from "@/lib/pagination";
import {
  listMissingPaymentReportsPaginated,
  type MissingPaymentReportFilter,
} from "@/server/repositories/missing-payment-report.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { DashboardNav } from "@/components/layout/DashboardNav";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Pagination } from "@/components/ui/Pagination";
import { ReviewMissingPaymentReportButton } from "@/components/forms/ReviewMissingPaymentReportButton";

const STATUS_TONE = { OPEN: "amber", RESOLVED: "green", DISMISSED: "gray" } as const;

interface PaymentReportsPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function PaymentReportsPage({ searchParams }: PaymentReportsPageProps) {
  await requireRole("ADMIN");
  const params = await searchParams;
  const page = parsePageParam(params.page);
  const status: MissingPaymentReportFilter | undefined =
    params.status === "OPEN" || params.status === "RESOLVED" || params.status === "DISMISSED"
      ? params.status
      : undefined;
  const { reports, totalCount } = await listMissingPaymentReportsPaginated({ status, page });

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Payment Reports" />
      <DashboardNav />
      <main className="flex-1 space-y-5 p-4 sm:p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Customer Payment Reports ({totalCount})</h2>
            <p className="max-w-2xl text-sm text-ink-muted">
              Investigate payments customers say are not reflected. Closing a report never changes
              savings; use the normal audited payment workflow for any verified correction.
            </p>
          </div>
          <nav aria-label="Filter payment reports by status" className="flex flex-wrap gap-2">
            {(["OPEN", "RESOLVED", "DISMISSED"] as const).map((option) => (
              <FilterLink key={option} href={`/admin/payment-reports?status=${option}`} active={status === option}>
                {option}
              </FilterLink>
            ))}
            <FilterLink href="/admin/payment-reports" active={!status}>All</FilterLink>
          </nav>
        </div>

        <Card className="overflow-hidden p-0">
          {reports.length === 0 ? (
            <p className="p-8 text-center text-sm text-ink-muted">No payment reports found.</p>
          ) : (
            <>
              <div className="divide-y divide-line md:hidden">
                {reports.map((report) => (
                  <article key={report.id} className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-ink">{report.customerProfile.user.name}</h3>
                        <p className="text-sm text-ink-muted">{report.customerProfile.customerCode}</p>
                      </div>
                      <Badge tone={STATUS_TONE[report.status]}>{report.status}</Badge>
                    </div>
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <Detail label="Payment date" value={format(report.paymentDate, "dd MMM yyyy")} />
                      <Detail label="Amount reported" value={`₦${Number(report.reportedAmount).toLocaleString()}`} />
                      <Detail label="Assigned agent" value={report.customerProfile.assignedAgent.name} />
                      <Detail label="Reported" value={format(report.createdAt, "dd MMM, h:mm a")} />
                    </dl>
                    {report.customerNote && <p className="rounded-xl bg-surface-muted p-3 text-sm text-ink-muted">{report.customerNote}</p>}
                    {report.status === "OPEN" ? (
                      <ReviewMissingPaymentReportButton reportId={report.id} />
                    ) : (
                      <p className="text-sm text-ink-muted">
                        {report.reviewNote} {report.reviewedBy && `— ${report.reviewedBy.name}`}
                      </p>
                    )}
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-line bg-surface-muted text-ink-muted">
                    <tr>
                      <th className="px-4 py-3 font-medium">Customer</th>
                      <th className="px-4 py-3 font-medium">Payment</th>
                      <th className="px-4 py-3 font-medium">Agent</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {reports.map((report) => (
                      <tr key={report.id}>
                        <td className="px-4 py-3 align-top">
                          <Link href={`/admin/customers/${report.customerProfileId}`} className="font-semibold text-ink hover:text-brand hover:underline">
                            {report.customerProfile.user.name}
                          </Link>
                          <p className="text-xs text-ink-muted">{report.customerProfile.customerCode} · {report.customerProfile.user.phone ?? "No phone"}</p>
                          {report.customerNote && <p className="mt-1 max-w-sm text-xs text-ink-subtle">{report.customerNote}</p>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top text-ink-muted">
                          <p className="font-medium text-ink">₦{Number(report.reportedAmount).toLocaleString()}</p>
                          <p>{format(report.paymentDate, "dd MMM yyyy")}</p>
                          <p className="text-xs text-ink-subtle">Reported {format(report.createdAt, "dd MMM, h:mm a")}</p>
                        </td>
                        <td className="px-4 py-3 align-top text-ink-muted">{report.customerProfile.assignedAgent.name}</td>
                        <td className="px-4 py-3 align-top"><Badge tone={STATUS_TONE[report.status]}>{report.status}</Badge></td>
                        <td className="px-4 py-3 align-top">
                          {report.status === "OPEN" ? (
                            <ReviewMissingPaymentReportButton reportId={report.id} />
                          ) : (
                            <div className="max-w-xs text-xs text-ink-muted">
                              <p>{report.reviewNote}</p>
                              <p className="mt-1 text-ink-subtle">{report.reviewedBy?.name ?? "Admin"}</p>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <Pagination
            currentPage={page}
            totalPages={totalPages(totalCount)}
            searchParams={params}
            basePath="/admin/payment-reports"
          />
        </Card>
      </main>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:min-h-0 ${active ? "bg-brand-solid text-white hover:bg-brand-solid-hover" : "border border-line-strong bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink"}`}
    >
      {children}
    </Link>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-ink-subtle">{label}</dt><dd className="mt-0.5 font-medium text-ink">{value}</dd></div>;
}
