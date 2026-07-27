/**
 * Simple horizontal progress bar — used on the Customer Tracking Dashboard's
 * Savings Summary card to show days-paid-of-durationDays at a glance,
 * alongside the exact numbers (already shown elsewhere as text stats).
 * A plain, dependency-free div-based bar; no charting library needed for a
 * single value/max ratio.
 */
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** Current value (e.g. days paid). */
  value: number;
  /** Target value (e.g. plan durationDays). */
  max: number;
  /** Optional label shown above the bar, with the value/max on the right. */
  label?: string;
  className?: string;
}

export function ProgressBar({ value, max, label, className }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs text-gray-500">
          <span>{label}</span>
          <span className="font-medium text-gray-700">
            {value}/{max} days · {pct}%
          </span>
        </div>
      )}
      <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-emerald-600 transition-all"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
    </div>
  );
}
