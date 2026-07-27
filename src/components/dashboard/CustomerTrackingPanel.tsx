/**
 * Customer Tracking Dashboard panel.
 * ----------------------------------------------------------------------------
 * Shared between the Admin and Agent customer detail pages (the only
 * difference between the two contexts is the printable-receipt base path
 * and whether the Quick Pay modal is opened in "Admin" mode) — this keeps
 * the actual tracking UI (savings summary, progress bar, payment tracking
 * table / digital passbook / payment history, Quick Record Payment button)
 * defined in exactly one place.
 *
 * Sections rendered here map directly onto the requested Customer Tracking
 * Dashboard spec:
 *  - Savings summary       -> Savings Summary card
 *  - Days paid and missed  -> stats inside the Savings Summary card
 *  - Progress bar          -> <ProgressBar> inside the Savings Summary card
 *  - Payment tracking table
 *    / Digital passbook
 *    / Payment history     -> <PaymentHistoryTable> (one chronological
 *                              ledger serves all three — see that
 *                              component's header comment)
 *  - Quick Record Payment  -> <QuickPayButton initialCustomerProfileId=...>
 *  - Printable receipts    -> receipt links inside <PaymentHistoryTable>
 * (Customer profile itself is rendered separately by each page, since its
 * exact fields/layout already differ slightly between the Admin and Agent
 * detail pages.)
 */
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/dashboard/ProgressBar";
import { PaymentHistoryTable, type PassbookRow } from "@/components/dashboard/PaymentHistoryTable";
import { QuickPayButton } from "@/components/forms/QuickPayButton";
import { CreatePlanForm } from "@/components/forms/CreatePlanForm";
import type { CustomerSearchOption } from "@/components/forms/CustomerSearchSelect";
import { format } from "date-fns";

interface CustomerTrackingPanelProps {
  customerProfileId: string;
  planWithProgress: {
    plan: {
      dailyAmount: unknown;
      durationDays: number;
      expectedMaturityDate: Date;
      status: "ACTIVE" | "COMPLETED" | "PAID_OUT";
    };
    progress: {
      daysPaid: number;
      daysMissed: number;
      daysRemaining: number;
      totalSaved: number;
    };
  } | null;
  passbookRows: PassbookRow[];
  isAdmin: boolean;
  /** This one customer, pre-shaped for the Quick Pay modal's search-select
   * (which requires an options array even though only one is selectable
   * here — the modal's customer field is pre-filled and effectively locked
   * via `initialCustomerProfileId`). */
  quickPayCustomer: CustomerSearchOption;
}

export function CustomerTrackingPanel({
  customerProfileId,
  planWithProgress,
  passbookRows,
  isAdmin,
  quickPayCustomer,
}: CustomerTrackingPanelProps) {
  const receiptBasePath = isAdmin ? "/admin/contributions" : "/agent/contributions";

  return (
    <>
      {/* Savings summary, days paid/missed, and progress bar */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Savings Summary
          </h3>
          {planWithProgress && <Badge tone="blue">{planWithProgress.plan.status}</Badge>}
        </div>

        {planWithProgress ? (
          <div className="space-y-4">
            <ProgressBar
              label="Cycle progress"
              value={planWithProgress.progress.daysPaid}
              max={planWithProgress.plan.durationDays}
            />
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              <SummaryStat
                label="Daily amount"
                value={`₦${Number(planWithProgress.plan.dailyAmount).toLocaleString()}`}
              />
              <SummaryStat
                label="Total saved"
                value={`₦${planWithProgress.progress.totalSaved.toLocaleString()}`}
                tone="green"
              />
              <SummaryStat label="Days paid" value={String(planWithProgress.progress.daysPaid)} tone="green" />
              <SummaryStat label="Days missed" value={String(planWithProgress.progress.daysMissed)} tone="red" />
              <SummaryStat label="Days remaining" value={String(planWithProgress.progress.daysRemaining)} />
            </div>
            <p className="text-xs text-gray-400">
              Reference maturity date: {format(planWithProgress.plan.expectedMaturityDate, "dd MMM yyyy")}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-gray-500">
              No active savings plan. Start one to begin tracking daily contributions.
            </p>
            <CreatePlanForm customerProfileId={customerProfileId} />
          </>
        )}
      </Card>

      {/* Quick Record Payment */}
      <Card>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Record a Payment
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Record today&apos;s (or, for Admins, a backdated/override) payment for this
              customer without leaving this page.
            </p>
          </div>
          <QuickPayButton
            customers={[quickPayCustomer]}
            isAdmin={isAdmin}
            initialCustomerProfileId={customerProfileId}
            label="Quick Record Payment"
          />
        </div>
      </Card>

      {/* Payment tracking table / digital passbook / payment history */}
      <Card className="overflow-x-auto p-0">
        <div className="px-6 pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Digital Passbook &amp; Payment History
          </h3>
          <p className="mt-1 pb-4 text-sm text-gray-500">
            Every day&apos;s outcome for this customer, newest first. Paid entries link to a
            printable receipt.
          </p>
        </div>
        <PaymentHistoryTable rows={passbookRows} receiptBasePath={receiptBasePath} />
      </Card>
    </>
  );
}

function SummaryStat({
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
