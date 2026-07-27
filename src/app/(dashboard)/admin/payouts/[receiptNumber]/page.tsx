/**
 * Admin > Payout Receipt (printable).
 * ----------------------------------------------------------------------------
 * A single, print-friendly receipt for one Payout, looked up by its
 * system-generated receiptNumber (e.g. "PR-000045"). Uses a plain browser
 * print (`window.print()` via the client PrintButton) rather than a PDF
 * library — this keeps the receipt WYSIWYG with the page and avoids adding
 * a server-side PDF renderer for a single printable view (bulk PDF export
 * for Reports is a separate concern, handled with pdf-lib there).
 */
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/session";
import { findPayoutByReceiptNumber } from "@/server/repositories/payout.repository";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { Card } from "@/components/ui/Card";
import { PrintButton } from "@/components/forms/PrintButton";
import { format } from "date-fns";
import Link from "next/link";

export default async function PayoutReceiptPage({
  params,
}: {
  params: Promise<{ receiptNumber: string }>;
}) {
  await requireRole("ADMIN");
  const { receiptNumber } = await params;

  const payout = await findPayoutByReceiptNumber(receiptNumber);
  if (!payout) {
    notFound();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="print:hidden">
        <DashboardHeader title="Admin Dashboard" />
      </div>
      <main className="flex-1 p-4 sm:p-6">
        <div className="mx-auto max-w-lg">
          <div className="mb-4 flex items-center justify-between print:hidden">
            <Link href="/admin/payouts" className="text-sm font-medium text-emerald-700 hover:underline">
              &larr; Back to Payouts
            </Link>
            <PrintButton />
          </div>

          <Card>
            <div className="mb-6 border-b border-dashed border-gray-300 pb-4 text-center">
              <h1 className="text-lg font-bold text-gray-900">Davchuks Daily Thrift</h1>
              <p className="text-sm text-gray-500">Payout Receipt</p>
            </div>

            <dl className="space-y-3 text-sm">
              <Row label="Receipt Number" value={payout.receiptNumber} mono />
              <Row label="Customer" value={payout.customerProfile.user.name} />
              <Row label="Customer Code" value={payout.customerProfile.customerCode} mono />
              <Row label="Total Savings Paid Out" value={`₦${Number(payout.totalSavings).toLocaleString()}`} />
              <Row
                label="Payout Method"
                value={payout.payoutMethod === "CASH" ? "Cash" : "Bank Transfer"}
              />
              <Row label="Payout Date" value={format(payout.payoutDate, "dd MMMM yyyy")} />
              <Row label="Approved By" value={payout.approvedBy.name} />
              {payout.note && <Row label="Note" value={payout.note} />}
            </dl>

            <p className="mt-6 border-t border-dashed border-gray-300 pt-4 text-center text-xs text-gray-400">
              This receipt confirms a payout made manually (cash or bank transfer) outside this
              system. It is a record only — no payment was processed by this application.
            </p>
          </Card>
        </div>
      </main>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className={`text-right font-medium text-gray-900 ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
