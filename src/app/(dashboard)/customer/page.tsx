/**
 * Customer dashboard — own profile + savings progress view.
 * ----------------------------------------------------------------------------
 * Enforces "Customers can only view their own ... profile": the profile is
 * looked up by the CURRENT SESSION's user id (`findCustomerProfileByUserId`),
 * never by an id supplied from the URL or a form — so there is no way for a
 * customer to view anyone else's data by manipulating a request.
 *
 * Savings Progress card shows the customer's current ACTIVE plan (daily
 * amount, total saved, days paid/missed/remaining, reference maturity date,
 * status) computed live from their own Contribution rows — see
 * getActivePlanWithProgress(). If there is no active plan (brand new
 * customer, or their last cycle was already paid out), a simple message is
 * shown instead. Past payouts (if any) are listed below as history.
 */
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { findCustomerProfileByUserId } from "@/server/repositories/customer.repository";
import { getActivePlanWithProgress } from "@/server/services/contribution-plan.service";
import { listPayoutsForCustomer } from "@/server/repositories/payout.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";
import { MonthlyTrackingSheets } from "@/components/dashboard/MonthlyTrackingSheets";
import { getBusinessSettings } from "@/server/services/settings.service";
import { listMissingPaymentReportsForCustomer } from "@/server/repositories/missing-payment-report.repository";
import { MissingPaymentReportButton } from "@/components/forms/MissingPaymentReportButton";
import { dateKey, today } from "@/lib/date";
import { resolveCustomerSupportContacts } from "@/lib/customer-support-contact";

const REPORT_STATUS_TONE = { OPEN: "amber", RESOLVED: "green", DISMISSED: "gray" } as const;

export default async function CustomerDashboardPage() {
  const user = await requireRole("CUSTOMER");

  const profile = await findCustomerProfileByUserId(user.id);
  if (!profile) {
    // Should not normally happen (every CUSTOMER-role User is created together
    // with a CustomerProfile in a transaction), but guard against orphaned
    // accounts rather than crashing.
    notFound();
  }

  const [planWithProgress, payoutHistory, settings, paymentReports] = await Promise.all([
    getActivePlanWithProgress(profile.id),
    listPayoutsForCustomer(profile.id),
    getBusinessSettings(),
    listMissingPaymentReportsForCustomer(profile.id),
  ]);
  const { callNumber, whatsappNumber } = resolveCustomerSupportContacts(settings);

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Customer Dashboard" />
      <main className="flex-1 space-y-6 p-4 sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Welcome, {profile.user.name}
          </h2>
          <p className="text-sm text-gray-500">
            Your daily savings progress and payout status, always up to date.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Profile card */}
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              My Profile
            </h3>
            <dl className="space-y-3 text-sm">
              <Row label="Full name" value={profile.user.name} />
              <Row label="Phone" value={profile.user.phone ?? "—"} />
              <Row label="ID number" value={profile.idNumber} />
              <Row
                label="Status"
                value={
                  <Badge tone={profile.user.isActive ? "green" : "red"}>
                    {profile.user.isActive ? "Active" : "Inactive"}
                  </Badge>
                }
              />
              <Row
                label="Customer since"
                value={format(profile.createdAt, "dd MMM yyyy")}
              />
            </dl>
          </Card>

          {/* Assigned agent card */}
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              My Agent
            </h3>
            <p className="text-sm text-gray-600">
              Your daily contributions are collected by:
            </p>
            <p className="mt-2 text-base font-medium text-gray-900">
              {profile.assignedAgent.name}
            </p>
            {profile.assignedAgent.phone && (
              <p className="text-sm text-gray-500">{profile.assignedAgent.phone}</p>
            )}
            {profile.assignedAgent.email && (
              <p className="text-sm text-gray-500">{profile.assignedAgent.email}</p>
            )}
            <p className="mt-3 text-xs text-gray-400">
              If your agent changes, you&apos;ll see the updated name here
              automatically.
            </p>
          </Card>
        </div>

        {/* Savings Progress */}
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Savings Progress
            </h3>
            {planWithProgress && (
              <Badge tone="blue">{planWithProgress.plan.status}</Badge>
            )}
          </div>

          {planWithProgress ? (
            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              <ProgressStat
                label="Daily contribution"
                value={`₦${Number(planWithProgress.plan.dailyAmount).toLocaleString()}`}
              />
              <ProgressStat
                label="Total saved so far"
                value={`₦${planWithProgress.progress.totalSaved.toLocaleString()}`}
                tone="green"
              />
              <ProgressStat label="Days paid" value={String(planWithProgress.progress.daysPaid)} />
              <ProgressStat
                label="Days missed"
                value={String(planWithProgress.progress.daysMissed)}
                tone="red"
              />
              <ProgressStat
                label="Days remaining"
                value={String(planWithProgress.progress.daysRemaining)}
              />
              <ProgressStat
                label="Reference maturity date"
                value={format(planWithProgress.plan.expectedMaturityDate, "dd MMM yyyy")}
              />
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              You don&apos;t have an active savings cycle right now. Speak to your agent to start
              a new one, or check your payout history below if your last cycle was recently paid
              out.
            </p>
          )}
        </Card>

        <section>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">My 31-Day Tracking Sheets</h2>
          <MonthlyTrackingSheets customerProfileId={profile.id} />
        </section>

        <Card>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-2xl">
              <h2 className="text-lg font-semibold text-ink">Payment Help</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                If money you paid is not showing in your history or tracking sheet, report it for
                an admin to investigate. Reports never add money automatically.
              </p>
              {(callNumber || whatsappNumber || settings.supportEmail) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {callNumber && (
                    <a href={`tel:${callNumber}`} className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-hover">
                      Call {callNumber}
                    </a>
                  )}
                  {whatsappNumber && (
                    <a href={`https://wa.me/${whatsappNumber}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-brand-ink hover:bg-surface-hover">
                      WhatsApp Support
                    </a>
                  )}
                  {settings.supportEmail && (
                    <a href={`mailto:${settings.supportEmail}`} className="inline-flex min-h-11 items-center rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-hover">
                      Email Support
                    </a>
                  )}
                </div>
              )}
            </div>
            <MissingPaymentReportButton businessDate={dateKey(today())} />
          </div>

          {paymentReports.length > 0 && (
            <div className="mt-6 border-t border-line pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">My Recent Reports</h3>
              <ul className="mt-3 divide-y divide-line">
                {paymentReports.map((report) => (
                  <li key={report.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium text-ink">
                        ₦{Number(report.reportedAmount).toLocaleString()} paid {format(report.paymentDate, "dd MMM yyyy")}
                      </p>
                      <p className="text-xs text-ink-muted">Reported {format(report.createdAt, "dd MMM yyyy, h:mm a")}</p>
                      {report.reviewNote && <p className="mt-1 text-sm text-ink-muted">{report.reviewNote}</p>}
                    </div>
                    <Badge tone={REPORT_STATUS_TONE[report.status]}>{report.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        {/* Payout history */}
        {payoutHistory.length > 0 && (
          <Card>
            <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Payout History
            </h3>
            <ul className="divide-y divide-gray-100">
              {payoutHistory.map((payout) => (
                <li key={payout.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">
                      ₦{Number(payout.totalSavings).toLocaleString()} ·{" "}
                      {payout.payoutMethod === "CASH" ? "Cash" : "Bank Transfer"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {format(payout.payoutDate, "dd MMM yyyy")} · Receipt {payout.receiptNumber}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500">Approved by {payout.approvedBy.name}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function ProgressStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  const toneClass = tone === "green" ? "text-emerald-700" : tone === "red" ? "text-red-700" : "text-gray-900";
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}
