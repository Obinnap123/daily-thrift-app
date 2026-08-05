/**
 * Date helpers shared by Contribution tracking, Reconciliation, and Reports.
 * ----------------------------------------------------------------------------
 * Contribution.collectionDate / DailyReconciliation.reconciliationDate /
 * Payout.payoutDate are all stored as Postgres DATE columns (time-of-day is
 * meaningless for "which day was this collection for") — these helpers make
 * sure every write path truncates to a plain calendar date the same way, so
 * `collectionDate` values are always comparable regardless of what time of
 * day the agent happened to press "record".
 */
const BUSINESS_TIME_ZONE = "Africa/Lagos";

/** Preserve a calendar date at UTC midnight — safe for a Postgres `DATE` column. */
export function toDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Today's Lagos calendar date represented without a time component. */
export function today(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)));
}

/** [Monday, Sunday] range containing `date` — used for "this week" totals. */
export function weekRange(date: Date = today()): { start: Date; end: Date } {
  const anchor = toDateOnly(date);
  const daysSinceMonday = (anchor.getUTCDay() + 6) % 7;
  return {
    start: addDaysToDate(anchor, -daysSinceMonday),
    end: addDaysToDate(anchor, 6 - daysSinceMonday),
  };
}

/** [1st, last day] range containing `date` — used for "this month" totals. */
export function monthRange(date: Date = today()): { start: Date; end: Date } {
  const anchor = toDateOnly(date);
  return {
    start: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1)),
    end: new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)),
  };
}

/** `startDate + durationDays` — the plan's reference (not guaranteed) maturity date. */
export function addDaysToDate(date: Date, days: number): Date {
  const result = toDateOnly(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/** Stable key for comparing values from Postgres DATE columns. */
export function dateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
