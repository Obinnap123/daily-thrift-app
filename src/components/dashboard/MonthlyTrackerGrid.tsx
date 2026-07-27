/**
 * 31-Day Tracking grid.
 * ----------------------------------------------------------------------------
 * A rolling 31-day (default) calendar-style grid of daily collection
 * activity, shared by both the Admin Dashboard (system-wide) and the Agent
 * Dashboard (scoped to the signed-in agent). Each cell represents one
 * calendar day and is colored by outcome:
 *   - emerald = at least one collection recorded, none missed
 *   - red     = at least one missed collection recorded that day
 *   - gray    = no activity recorded (no plan visited that day)
 * Today's cell gets a ring highlight so it's easy to spot at a glance.
 * A plain Server Component — the data (DailyTrackingDay[]) is computed
 * once on the server via getDailyTrackingSeries() and passed straight in;
 * no client-side fetching or state needed for a static 31-cell grid.
 */
import type { DailyTrackingDay } from "@/server/repositories/contribution.repository";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface MonthlyTrackerGridProps {
  title: string;
  subtitle?: string;
  series: DailyTrackingDay[];
}

export function MonthlyTrackerGrid({ title, subtitle, series }: MonthlyTrackerGridProps) {
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const totalCollectedDays = series.filter((day) => day.collectedCount > 0).length;
  const totalMissedDays = series.filter((day) => day.missedCount > 0 && day.collectedCount === 0).length;
  const totalAmount = series.reduce((sum, day) => sum + day.totalAmount, 0);

  return (
    <div>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
        <p className="text-xs text-gray-500">
          <span className="font-medium text-emerald-700">{totalCollectedDays} active</span>
          {" · "}
          <span className="font-medium text-red-700">{totalMissedDays} missed-only</span>
          {" · "}
          <span className="font-medium text-gray-900">₦{totalAmount.toLocaleString()} total</span>
        </p>
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))]">
        {series.map((day) => {
          const isToday = day.date === todayKey;
          const hasCollected = day.collectedCount > 0;
          const hasMissed = day.missedCount > 0;

          const toneClass = hasCollected
            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
            : hasMissed
              ? "bg-red-100 text-red-700 border-red-200"
              : "bg-gray-50 text-gray-400 border-gray-200";

          return (
            <div
              key={day.date}
              title={`${day.label}: ${
                hasCollected
                  ? `₦${day.totalAmount.toLocaleString()} collected (${day.collectedCount})`
                  : hasMissed
                    ? `${day.missedCount} missed`
                    : "No activity"
              }`}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-md border text-[10px] font-medium",
                toneClass,
                isToday && "ring-2 ring-offset-1 ring-emerald-600"
              )}
            >
              <span className="leading-none">{day.dayOfMonth}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-[11px] text-gray-500">
        <LegendDot toneClass="bg-emerald-100 border-emerald-200" label="Collected" />
        <LegendDot toneClass="bg-red-100 border-red-200" label="Missed" />
        <LegendDot toneClass="bg-gray-50 border-gray-200" label="No activity" />
        <LegendDot toneClass="bg-white border-emerald-600 ring-1 ring-emerald-600" label="Today" />
      </div>
    </div>
  );
}

function LegendDot({ toneClass, label }: { toneClass: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded border", toneClass)} />
      {label}
    </span>
  );
}
