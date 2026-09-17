import { calendarMonthKey } from "@/lib/payout-selection";

export const SETTLED_CORRECTION_MESSAGE =
  "This payment may affect money already paid out. Ask an Admin to review the settled payout; the normal edit cannot change it.";
export const UNTRACEABLE_CORRECTION_MESSAGE =
  "This payment cannot be safely separated from the payout history, so it cannot use the normal edit flow.";

type Allocation = { coverageDate: Date; amount: unknown; payoutMonthId: string | null };
type SettledMonth = { monthStart: Date; creditAmount: unknown };

export function assessContributionCorrection(input: {
  amount: unknown;
  allocations: Allocation[];
  payoutCount: number;
  settledMonths: SettledMonth[];
  hasOrphanAllocations: boolean;
}): { error: string | null; settledMonthKeys: Set<string> } {
  const settledMonthKeys = new Set(input.settledMonths.map((month) => calendarMonthKey(month.monthStart)));
  if (input.allocations.some((allocation) =>
    allocation.payoutMonthId || settledMonthKeys.has(calendarMonthKey(allocation.coverageDate)))) {
    return { error: SETTLED_CORRECTION_MESSAGE, settledMonthKeys };
  }

  if (input.payoutCount > 0 && (
    input.settledMonths.length === 0
    || input.hasOrphanAllocations
    || input.settledMonths.some((month) => Number(month.creditAmount) > 0)
    || Math.round(input.allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0) * 100)
      !== Math.round(Number(input.amount) * 100)
  )) {
    return { error: UNTRACEABLE_CORRECTION_MESSAGE, settledMonthKeys };
  }
  return { error: null, settledMonthKeys };
}
