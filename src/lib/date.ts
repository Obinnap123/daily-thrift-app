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
import {
  startOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
} from "date-fns";

/** Truncate a Date to midnight UTC-local — safe to store in a `@db.Date` column. */
export function toDateOnly(date: Date): Date {
  return startOfDay(date);
}

/** Today, truncated to a plain date (no time component). */
export function today(): Date {
  return startOfDay(new Date());
}

/** [Monday, Sunday] range containing `date` — used for "this week" totals. */
export function weekRange(date: Date = new Date()): { start: Date; end: Date } {
  return {
    start: startOfWeek(date, { weekStartsOn: 1 }),
    end: endOfWeek(date, { weekStartsOn: 1 }),
  };
}

/** [1st, last day] range containing `date` — used for "this month" totals. */
export function monthRange(date: Date = new Date()): { start: Date; end: Date } {
  return { start: startOfMonth(date), end: endOfMonth(date) };
}

/** `startDate + durationDays` — the plan's reference (not guaranteed) maturity date. */
export function addDaysToDate(date: Date, days: number): Date {
  return addDays(date, days);
}
