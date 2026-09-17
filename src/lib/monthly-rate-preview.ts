import { addDaysToDate } from "@/lib/date";
import { calendarMonthKey } from "@/lib/payout-selection";

export interface MonthlyRateChoice {
  month: string;
  dailyAmount: number;
}

export interface KnownMonthlyRate extends MonthlyRateChoice {
  locked: boolean;
}

/**
 * Work out which calendar-month rates a payment needs before it can be
 * allocated. Unknown months inherit the preceding month's rate as a visible
 * suggestion, but are still returned so the operator explicitly confirms or
 * changes them before submitting.
 */
export function previewRequiredMonthlyRates(input: {
  nextCoverageDate: Date;
  availableAmount: number;
  fallbackDailyAmount: number;
  knownRates: KnownMonthlyRate[];
  choices?: MonthlyRateChoice[];
  maximumSlots?: number;
}): MonthlyRateChoice[] {
  if (!Number.isFinite(input.availableAmount) || input.availableAmount < 0) return [];
  if (!Number.isFinite(input.fallbackDailyAmount) || input.fallbackDailyAmount <= 0) return [];

  const known = new Map(input.knownRates.map((rate) => [rate.month, rate.dailyAmount]));
  // A temporarily empty/invalid rate field must not make that month vanish
  // from the form while the operator is editing it. Ignore invalid draft
  // choices here and keep using the inherited suggestion for previewing;
  // final form validation still rejects the invalid value before submission.
  const choices = new Map(
    (input.choices ?? [])
      .filter((rate) => Number.isFinite(rate.dailyAmount) && rate.dailyAmount > 0)
      .map((rate) => [rate.month, rate.dailyAmount]),
  );
  const required = new Map<string, number>();
  let available = input.availableAmount;
  let cursor = input.nextCoverageDate;
  let inheritedRate = input.fallbackDailyAmount;
  const maximumSlots = input.maximumSlots ?? 3_660;

  for (let slot = 0; slot < maximumSlots; slot += 1) {
    if (available <= 0) break;
    const month = calendarMonthKey(cursor);
    const rate = choices.get(month) ?? known.get(month) ?? inheritedRate;
    if (!Number.isFinite(rate) || rate <= 0) break;
    // Once any payment value reaches a new month, keep that month's rate
    // confirmation visible even when the remaining value is only credit and
    // cannot yet fund a complete day at the chosen rate.
    if (!known.has(month)) required.set(month, rate);
    if (available < rate) break;
    inheritedRate = rate;
    available -= rate;
    cursor = addDaysToDate(cursor, 1);
  }

  return [...required].map(([month, dailyAmount]) => ({ month, dailyAmount }));
}
