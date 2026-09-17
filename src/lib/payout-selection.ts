export interface UnpaidAllocationLike {
  id: string;
  coverageDate: Date;
  amount: unknown;
}

export interface MonthRateLike {
  monthStart: Date;
  dailyAmount: unknown;
}

export interface PriorPayoutMonthLike {
  monthStart: Date;
  grossSavings: unknown;
  creditAmount: unknown;
  commissionAmount: unknown;
}

export interface PayoutMonthOption {
  key: string;
  monthStart: Date;
  dailyAmount: number;
  fundedSlots: number;
  allocationGross: number;
  creditAmount: number;
  grossSavings: number;
  settledGross: number;
  commissionCharged: boolean;
  allocationIds: string[];
}

export function calendarMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function calendarMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function buildPayoutMonthOptions(input: {
  allocations: UnpaidAllocationLike[];
  rates: MonthRateLike[];
  planDailyAmount: unknown;
  creditBalance: unknown;
  nextCoverageDate: Date | null;
  priorPayoutMonths?: PriorPayoutMonthLike[];
}): PayoutMonthOption[] {
  const rateByMonth = new Map(
    input.rates.map((rate) => [calendarMonthKey(rate.monthStart), Number(rate.dailyAmount)]),
  );
  const grouped = new Map<string, PayoutMonthOption>();

  for (const allocation of input.allocations) {
    const key = calendarMonthKey(allocation.coverageDate);
    const amount = Number(allocation.amount);
    const existing = grouped.get(key) ?? {
      key,
      monthStart: calendarMonthStart(allocation.coverageDate),
      dailyAmount: rateByMonth.get(key) ?? amount,
      fundedSlots: 0,
      allocationGross: 0,
      creditAmount: 0,
      grossSavings: 0,
      settledGross: 0,
      commissionCharged: false,
      allocationIds: [],
    };
    existing.fundedSlots += 1;
    existing.allocationGross += amount;
    existing.grossSavings += amount;
    existing.allocationIds.push(allocation.id);
    grouped.set(key, existing);
  }

  const credit = Number(input.creditBalance);
  if (credit > 0 && input.nextCoverageDate) {
    const key = calendarMonthKey(input.nextCoverageDate);
    const existing = grouped.get(key) ?? {
      key,
      monthStart: calendarMonthStart(input.nextCoverageDate),
      dailyAmount: rateByMonth.get(key) ?? Number(input.planDailyAmount),
      fundedSlots: 0,
      allocationGross: 0,
      creditAmount: 0,
      grossSavings: 0,
      settledGross: 0,
      commissionCharged: false,
      allocationIds: [],
    };
    existing.creditAmount += credit;
    existing.grossSavings += credit;
    grouped.set(key, existing);
  }

  for (const previous of input.priorPayoutMonths ?? []) {
    const month = grouped.get(calendarMonthKey(previous.monthStart));
    if (!month) continue;
    // Historical PayoutMonth rows include the credit consumed in that payout.
    // Only the remainder was settled from funded calendar cells.
    month.settledGross += Number(previous.grossSavings) - Number(previous.creditAmount);
    month.commissionCharged ||= Number(previous.commissionAmount) > 0;
  }

  for (const month of grouped.values()) {
    month.grossSavings = Math.max(0, Math.round((month.allocationGross - month.settledGross + month.creditAmount) * 100) / 100);
  }

  return [...grouped.values()].filter((month) => month.grossSavings > 0).sort(
    (left, right) => left.monthStart.getTime() - right.monthStart.getTime(),
  );
}

export interface RequestedMonthPayout { month: string; customerAmount: number }

export function calculatePayout(input: {
  months: PayoutMonthOption[];
  mode: "FULL" | "PARTIAL";
  requestedMonths: RequestedMonthPayout[];
  commissionDays: number;
}) {
  const requestByMonth = new Map(input.requestedMonths.map((row) => [row.month, row.customerAmount]));
  const breakdown = input.months
    .filter((month) => input.mode === "FULL" || requestByMonth.has(month.key))
    .map((month) => {
      const commissionAmount = month.commissionCharged ? 0 : month.dailyAmount * input.commissionDays;
      const maxCustomerAmount = Math.max(0, Math.round((month.grossSavings - commissionAmount) * 100) / 100);
      const customerAmount = input.mode === "FULL" ? maxCustomerAmount : requestByMonth.get(month.key)!;
      const grossSavings = Math.round((customerAmount + commissionAmount) * 100) / 100;
      const remainingBalance = Math.round((month.grossSavings - grossSavings) * 100) / 100;
      const creditAmount = Math.min(month.creditAmount, Math.max(0, grossSavings - (month.allocationGross - month.settledGross)));
      return { ...month, commissionAmount, maxCustomerAmount, customerAmount, grossSavings, remainingBalance, creditConsumed: creditAmount };
    });
  return {
    breakdown,
    grossSavings: breakdown.reduce((sum, month) => sum + month.grossSavings, 0),
    commissionAmount: breakdown.reduce((sum, month) => sum + month.commissionAmount, 0),
    customerAmount: breakdown.reduce((sum, month) => sum + month.customerAmount, 0),
    remainingBalance: input.months.reduce((sum, month) => sum + month.grossSavings, 0)
      - breakdown.reduce((sum, month) => sum + month.grossSavings, 0),
  };
}
