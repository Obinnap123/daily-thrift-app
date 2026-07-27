/**
 * Shared printable Contribution ("Quick Pay" / daily payment) receipt body.
 * Rendered by both the Admin and Agent receipt pages — same reasoning as
 * the Payout receipt: a plain browser print (`window.print()`) rather than
 * a PDF library, so the receipt stays WYSIWYG with the page.
 */
import { Card } from "@/components/ui/Card";
import { PrintButton } from "@/components/forms/PrintButton";
import { format } from "date-fns";
import Link from "next/link";

interface ContributionReceiptCardProps {
  backHref: string;
  backLabel: string;
  contribution: {
    receiptNumber: string | null;
    amount: unknown;
    paymentMethod: "CASH" | "BANK_TRANSFER";
    collectionDate: Date;
    note: string | null;
    isOverride: boolean;
    overrideReason: string | null;
    customerProfile: { customerCode: string; user: { name: string } };
    collectedBy: { name: string };
    overriddenBy: { name: string } | null;
  };
}

export function ContributionReceiptCard({
  backHref,
  backLabel,
  contribution,
}: ContributionReceiptCardProps) {
  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link href={backHref} className="text-sm font-medium text-emerald-700 hover:underline">
          &larr; {backLabel}
        </Link>
        <PrintButton />
      </div>

      <Card>
        <div className="mb-6 border-b border-dashed border-gray-300 pb-4 text-center">
          <h1 className="text-lg font-bold text-gray-900">Davchuks Daily Thrift</h1>
          <p className="text-sm text-gray-500">Payment Receipt</p>
        </div>

        <dl className="space-y-3 text-sm">
          <Row label="Receipt Number" value={contribution.receiptNumber ?? "—"} mono />
          <Row label="Customer" value={contribution.customerProfile.user.name} />
          <Row label="Customer Code" value={contribution.customerProfile.customerCode} mono />
          <Row label="Amount Paid" value={`₦${Number(contribution.amount ?? 0).toLocaleString()}`} />
          <Row
            label="Payment Method"
            value={contribution.paymentMethod === "CASH" ? "Cash" : "Bank Transfer"}
          />
          <Row label="Payment Date" value={format(contribution.collectionDate, "dd MMMM yyyy")} />
          <Row label="Recorded By" value={contribution.collectedBy.name} />
          {contribution.note && <Row label="Note" value={contribution.note} />}
          {contribution.isOverride && (
            <>
              <Row label="Override" value="Yes — same-day duplicate payment" />
              {contribution.overriddenBy && (
                <Row label="Approved By" value={contribution.overriddenBy.name} />
              )}
              {contribution.overrideReason && (
                <Row label="Override Reason" value={contribution.overrideReason} />
              )}
            </>
          )}
        </dl>

        <p className="mt-6 border-t border-dashed border-gray-300 pt-4 text-center text-xs text-gray-400">
          This receipt confirms a daily contribution payment made manually (cash or bank
          transfer) outside this system. It is a record only — no payment was processed by this
          application.
        </p>
      </Card>
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
