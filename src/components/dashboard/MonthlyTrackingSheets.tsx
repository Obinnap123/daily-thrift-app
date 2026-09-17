import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import type { TrackingSheet } from "@/lib/tracking";
import { getTrackingData } from "@/server/services/tracking.service";
import { resolvePlanDailyRate } from "@/lib/plan-daily-rate";
import { format } from "date-fns";

export async function MonthlyTrackingSheets({ customerProfileId }: { customerProfileId: string }) {
  const periods = await getTrackingData(customerProfileId);
  return (
    <div className="space-y-4">
      {periods.map(({ plan, sheets, fullSlots, credit, monthlyRates, paidMonthKeys, partialMonthBalances }) => (
        <Card key={plan.id} className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
            <div>
              <h3 className="font-semibold text-ink">{plan.status === "PAID_OUT" ? "Closed savings period" : "Current savings period"}</h3>
              <PeriodRate plan={plan} monthlyRates={monthlyRates} fullSlots={fullSlots} credit={credit} />
            </div>
            <Badge tone={plan.status === "PAID_OUT" ? "blue" : "green"}>{plan.status === "PAID_OUT" ? "PAID OUT" : "OPEN"}</Badge>
          </div>
          <div className="space-y-5 p-4 sm:p-5">
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted" aria-label="Tracking status legend">
              <span><span className="font-semibold text-brand-ink">✓</span> Paid</span>
              <span><span className="font-semibold text-danger">!</span> Unfunded past day</span>
              <span><span className="font-semibold text-ink-muted">—</span> Pending or unavailable</span>
            </div>
            {sheets.map((sheet) => <Sheet key={sheet.key} sheet={sheet} paidOut={paidMonthKeys.has(sheet.key)} partialBalance={partialMonthBalances.get(sheet.key)} />)}
          </div>
        </Card>
      ))}
    </div>
  );
}

function PeriodRate({ plan, monthlyRates, fullSlots, credit }: {
  plan: { dailyAmount: unknown; startDate: Date; nextCoverageDate: Date | null; status: string };
  monthlyRates: { monthStart: Date; dailyAmount: unknown }[];
  fullSlots: number;
  credit: number;
}) {
  const rate = resolvePlanDailyRate({
    initialDailyAmount: plan.dailyAmount,
    startDate: plan.startDate,
    coverageDate: plan.nextCoverageDate ?? plan.startDate,
    monthlyRates,
  });
  const monthLabel = format(new Date(`${rate.month}-01T00:00:00.000Z`), "MMM yyyy");
  return (
    <p className="text-sm text-ink-muted">
      {fullSlots} funded days · ₦{credit.toLocaleString()} credit · ₦{rate.dailyAmount.toLocaleString()}/day
      {` · ${plan.status === "PAID_OUT" ? "last agreed" : "latest agreed"} ${monthLabel}`}
    </p>
  );
}

function Sheet({ sheet, paidOut, partialBalance }: { sheet: TrackingSheet; paidOut: boolean; partialBalance?: number }) {
  return (
    <section aria-label={`${sheet.label} tracking sheet`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">{sheet.label}</h4>
        <span className="text-xs font-medium text-ink-muted">{sheet.paid}/{sheet.eligible} · {paidOut ? "PAID OUT" : partialBalance !== undefined ? `PARTIALLY PAID · ₦${partialBalance.toLocaleString()} left` : sheet.status.replaceAll("_", " ")}</span>
      </div>
      <div className="max-w-full overflow-x-auto pb-2" role="region" aria-label={`${sheet.label} daily cells`} tabIndex={0}>
        <div className="grid min-w-[992px] grid-cols-[repeat(31,minmax(28px,1fr))] gap-1">
          {sheet.cells.map((cell) => (
            <div key={cell.day} title={cell.date ? `${cell.date.toLocaleDateString()} — ${cell.state}` : "Not a valid calendar date"} className={`flex h-8 items-center justify-center rounded-md text-xs font-medium ${cell.state === "paid" ? "bg-emerald-600 text-white" : cell.state === "missed" ? "bg-danger-soft text-danger" : cell.state === "pending" ? "bg-surface-hover text-ink-muted" : "bg-surface-muted text-ink-subtle"}`} aria-label={`Day ${cell.day}: ${cell.state}`}>
              {cell.state === "paid" ? "✓" : cell.state === "pending" || cell.state === "missed" ? cell.day : "–"}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
