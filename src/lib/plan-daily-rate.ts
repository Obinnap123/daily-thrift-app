import { calendarMonthKey } from "@/lib/payout-selection";

/** The latest agreed monthly rate at or before the next day to be funded. */
export function resolvePlanDailyRate(input: {
  initialDailyAmount: unknown;
  startDate: Date;
  coverageDate: Date;
  monthlyRates: { monthStart: Date; dailyAmount: unknown }[];
}): { dailyAmount: number; month: string } {
  const coverageMonth = calendarMonthKey(input.coverageDate);
  const agreed = input.monthlyRates
    .filter((rate) => calendarMonthKey(rate.monthStart) <= coverageMonth)
    .sort((a, b) => b.monthStart.getTime() - a.monthStart.getTime())[0];

  return agreed
    ? { dailyAmount: Number(agreed.dailyAmount), month: calendarMonthKey(agreed.monthStart) }
    : { dailyAmount: Number(input.initialDailyAmount), month: calendarMonthKey(input.startDate) };
}
