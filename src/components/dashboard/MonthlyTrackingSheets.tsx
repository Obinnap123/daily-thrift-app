import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { TrackingSheet } from "@/lib/tracking";
import { getTrackingData } from "@/server/services/tracking.service";

export async function MonthlyTrackingSheets({ customerProfileId }: { customerProfileId: string }) {
  const periods = await getTrackingData(customerProfileId);
  return (
    <div className="space-y-4">
      {periods.map(({ plan, sheets, fullSlots, credit }) => (
        <Card key={plan.id} className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
            <div>
              <h3 className="font-semibold text-ink">{plan.status === "PAID_OUT" ? "Closed savings period" : "Current savings period"}</h3>
              <p className="text-sm text-ink-muted">{fullSlots} funded days · ₦{credit.toLocaleString()} credit · ₦{Number(plan.dailyAmount).toLocaleString()}/day</p>
            </div>
            <Badge tone={plan.status === "PAID_OUT" ? "blue" : "green"}>{plan.status === "PAID_OUT" ? "PAID OUT" : "OPEN"}</Badge>
          </div>
          <div className="space-y-5 p-4 sm:p-5">{sheets.map((sheet) => <Sheet key={sheet.key} sheet={sheet} />)}</div>
        </Card>
      ))}
    </div>
  );
}

function Sheet({ sheet }: { sheet: TrackingSheet }) {
  return (
    <section aria-label={`${sheet.label} tracking sheet`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{sheet.label}</h4>
        <span className="text-xs font-medium text-ink-muted">{sheet.paid}/{sheet.eligible} · {sheet.status.replaceAll("_", " ")}</span>
      </div>
      <div className="max-w-full overflow-x-auto pb-2" role="region" aria-label={`${sheet.label} daily cells`} tabIndex={0}>
        <div className="grid min-w-[992px] grid-cols-[repeat(31,minmax(28px,1fr))] gap-1">
          {sheet.cells.map((cell) => (
            <div key={cell.day} title={cell.date ? `${cell.date.toLocaleDateString()} — ${cell.state}` : "Not a valid calendar date"} className={`flex h-8 items-center justify-center rounded-md text-xs font-medium ${cell.state === "paid" ? "bg-emerald-600 text-white" : cell.state === "pending" ? "bg-surface-hover text-ink-muted" : "bg-surface-muted text-ink-subtle"}`} aria-label={`Day ${cell.day}: ${cell.state}`}>
              {cell.state === "paid" ? "✓" : cell.state === "pending" ? cell.day : "–"}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
