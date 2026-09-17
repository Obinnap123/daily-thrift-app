import { notFound } from "next/navigation";
import { format } from "date-fns";
import { requireRole } from "@/lib/session";
import { findPayoutByReceiptNumber } from "@/server/repositories/payout.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { PrintButton } from "@/components/forms/PrintButton";
import Link from "next/link";

export default async function AgentPayoutReceipt({ params }: { params: Promise<{ receiptNumber: string }> }) {
  const user = await requireRole("AGENT");
  const { receiptNumber } = await params;
  const payout = await findPayoutByReceiptNumber(receiptNumber);
  if (!payout || payout.customerProfile.assignedAgentId !== user.id) notFound();

  return (
    <div className="flex min-h-screen flex-col">
      <DashboardHeader title="Payout Receipt" />
      <main className="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
          <Link href="/agent/payouts" className="text-sm font-medium text-brand underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">&larr; Back to payouts</Link>
          <PrintButton />
        </div>
        <Card>
          <div className="mb-5 flex justify-between gap-3">
            <div><p className="text-sm text-ink-muted">Receipt</p><h2 className="font-mono text-xl font-bold text-ink">{payout.receiptNumber}</h2></div>
          </div>
          <dl className="space-y-3 text-sm">
            <Row label="Customer" value={payout.customerProfile.user.name} />
            <Row label="Gross savings used" value={`₦${Number(payout.grossSavings).toLocaleString()}`} />
            <Row label="Company commission" value={`₦${Number(payout.commissionAmount).toLocaleString()}`} />
            <Row label="Customer received" value={`₦${Number(payout.customerAmount).toLocaleString()}`} />
            <Row label="Payout type" value={payout.scope === "PARTIAL" ? "Partial payout" : "Full payout"} />
            <Row label="Remaining saved balance" value={`₦${Number(payout.remainingBalance).toLocaleString()}`} />
            <Row label="Method" value={payout.payoutMethod === "CASH" ? "Cash" : "Bank transfer"} />
            <Row label="Date" value={format(payout.payoutDate, "dd MMMM yyyy")} />
            <Row label="Processed by" value={payout.approvedBy.name} />
            {payout.note && <Row label="Note" value={payout.note} />}
          </dl>
          {payout.months.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-semibold text-ink">Months included</h3>
              <ul className="space-y-2 text-sm">
                {payout.months.map((month) => (
                  <li key={month.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-2 text-ink">
                    <span>{format(month.monthStart, "MMMM yyyy")}</span>
                    <span className="text-right">₦{Number(month.customerAmount).toLocaleString()} to customer · ₦{Number(month.commissionAmount).toLocaleString()} commission</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-4 border-b border-line pb-2"><dt className="text-ink-muted">{label}</dt><dd className="text-right font-medium text-ink">{value}</dd></div>;
}
