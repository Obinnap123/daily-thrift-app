/**
 * Payment History / Digital Passbook table for the Customer Tracking
 * Dashboard.
 * ----------------------------------------------------------------------------
 * Renders every Contribution row for a customer (across all their savings
 * cycles) newest-first — this doubles as both the "Payment tracking table"
 * and the "Digital passbook" sections requested for the Customer Tracking
 * Dashboard, since they are the same underlying data (every day's outcome)
 * just described two ways: a passbook is traditionally a chronological
 * ledger of entries, which is exactly what this table already is.
 * COLLECTED rows with a receipt number link straight to the printable
 * receipt page; MISSED rows have no receipt (nothing was collected).
 */
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { format } from "date-fns";

export interface PassbookRow {
  id: string;
  collectionDate: Date;
  status: "COLLECTED" | "MISSED";
  amount: unknown;
  paymentMethod: "CASH" | "BANK_TRANSFER";
  receiptNumber: string | null;
  isOverride: boolean;
  note: string | null;
  collectedBy: { name: string };
}

interface PaymentHistoryTableProps {
  rows: PassbookRow[];
  /** "/admin/contributions" or "/agent/contributions" — printable receipt base path. */
  receiptBasePath: string;
}

export function PaymentHistoryTable({ rows, receiptBasePath }: PaymentHistoryTableProps) {
  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-gray-500">
        No payment activity recorded yet for this customer.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
          <tr>
            <th className="px-4 py-3 font-medium">Date</th>
            <th className="px-4 py-3 font-medium">Outcome</th>
            <th className="px-4 py-3 font-medium">Amount</th>
            <th className="px-4 py-3 font-medium">Method</th>
            <th className="px-4 py-3 font-medium">Recorded By</th>
            <th className="px-4 py-3 font-medium">Receipt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 text-gray-700">
                {format(row.collectionDate, "dd MMM yyyy")}
              </td>
              <td className="px-4 py-3">
                <Badge tone={row.status === "COLLECTED" ? "green" : "red"}>
                  {row.status === "COLLECTED" ? "Paid" : "Missed"}
                </Badge>
                {row.isOverride && (
                  <Badge tone="amber" className="ml-1.5">
                    Override
                  </Badge>
                )}
              </td>
              <td className="px-4 py-3 text-gray-900">
                {row.status === "COLLECTED" ? `₦${Number(row.amount ?? 0).toLocaleString()}` : "—"}
              </td>
              <td className="px-4 py-3 text-gray-600">
                {row.status === "COLLECTED"
                  ? row.paymentMethod === "CASH"
                    ? "Cash"
                    : "Bank Transfer"
                  : "—"}
              </td>
              <td className="px-4 py-3 text-gray-600">{row.collectedBy.name}</td>
              <td className="px-4 py-3">
                {row.receiptNumber ? (
                  <Link
                    href={`${receiptBasePath}/${row.receiptNumber}`}
                    className="font-medium text-emerald-700 hover:underline"
                  >
                    {row.receiptNumber}
                  </Link>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
