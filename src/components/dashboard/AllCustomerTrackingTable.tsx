import Link from "next/link";
import type { CurrentTrackingRow } from "@/server/services/tracking.service";

export function AllCustomerTrackingTable({ rows, role }: { rows: CurrentTrackingRow[]; role: "ADMIN" | "AGENT" }) {
  if (!rows.length) return <p className="p-6 text-center text-sm text-ink-muted">No customers have an open savings period.</p>;
  return (
    <div className="max-w-full overflow-x-auto" role="region" aria-label="Customer tracking table" tabIndex={0}>
      <table className="w-full min-w-[1380px] text-left text-sm">
        <thead className="border-b border-line bg-brand-soft text-brand-ink">
          <tr>
            <th scope="col" className="sticky left-0 z-20 bg-brand-soft px-4 py-3">Customer</th>
            {role === "ADMIN" && <th scope="col" className="px-3 py-3">Agent</th>}
            <th scope="col" className="px-3 py-3">Daily</th><th scope="col" className="px-3 py-3">Progress</th><th scope="col" className="px-3 py-3">Credit</th>
            {Array.from({ length: 31 }, (_, i) => <th scope="col" key={i} className="px-1 py-3 text-center">{i + 1}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row) => (
            <tr key={row.planId} className="hover:bg-surface-muted">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-3 text-left">
                <Link href={`/${role === "ADMIN" ? "admin" : "agent"}/customers/${row.customerProfileId}`} className="font-semibold text-ink hover:text-brand hover:underline">{row.customerName}</Link>
                <span className="block text-xs font-normal text-ink-subtle">{row.phone ?? "—"} · {row.sheet.label}</span>
              </th>
              {role === "ADMIN" && <td className="px-3 py-3 text-ink-muted">{row.agentName}</td>}
              <td className="whitespace-nowrap px-3 py-3">₦{row.dailyAmount.toLocaleString()}</td>
              <td className="whitespace-nowrap px-3 py-3">{row.sheet.paid}/{row.sheet.eligible}<span className="block text-xs text-ink-subtle">{row.sheetCount} sheet{row.sheetCount === 1 ? "" : "s"}</span></td>
              <td className="whitespace-nowrap px-3 py-3">₦{row.credit.toLocaleString()}</td>
              {row.sheet.cells.map((cell) => <td key={cell.day} className="px-1 py-2"><span title={cell.state} aria-label={`Day ${cell.day}: ${cell.state}`} className={`flex h-7 w-7 items-center justify-center rounded-md text-xs ${cell.state === "paid" ? "bg-emerald-600 text-white" : cell.state === "pending" ? "bg-surface-hover text-ink-muted" : "bg-surface-muted text-ink-subtle"}`}>{cell.state === "paid" ? "✓" : "–"}</span></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
