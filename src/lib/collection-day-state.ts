import { toDateOnly } from "@/lib/date";

export type CollectionDayState =
  | "NOT_STARTED"
  | "COVERED_TODAY"
  | "COVERED_IN_ADVANCE"
  | "PAYMENT_RECORDED_UNCOVERED"
  | "MISSED_RECORDED"
  | "DUE";

interface ResolveCollectionDayStateInput {
  businessDate: Date;
  planStartDate: Date;
  hasCoverageAllocation: boolean;
  coveragePaymentDate?: Date | null;
  contributionStatus?: "COLLECTED" | "MISSED" | null;
}

/**
 * Resolve what an Agent should see for one customer's current calendar day.
 * Coverage takes precedence over transaction activity because one earlier
 * transaction can legitimately fund several later calendar days.
 */
export function resolveCollectionDayState({
  businessDate,
  planStartDate,
  hasCoverageAllocation,
  coveragePaymentDate,
  contributionStatus,
}: ResolveCollectionDayStateInput): CollectionDayState {
  if (toDateOnly(planStartDate) > toDateOnly(businessDate)) return "NOT_STARTED";

  if (hasCoverageAllocation) {
    if (
      coveragePaymentDate &&
      toDateOnly(coveragePaymentDate) < toDateOnly(businessDate)
    ) {
      return "COVERED_IN_ADVANCE";
    }
    return "COVERED_TODAY";
  }

  if (contributionStatus === "COLLECTED") return "PAYMENT_RECORDED_UNCOVERED";
  if (contributionStatus === "MISSED") return "MISSED_RECORDED";
  return "DUE";
}

/** Number of calendar dates before `businessDate` that remain unfunded. */
export function countUnfundedPastDays(
  nextCoverageDate: Date,
  businessDate: Date,
): number {
  const next = toDateOnly(nextCoverageDate);
  const asOf = toDateOnly(businessDate);
  if (next >= asOf) return 0;
  return Math.floor((asOf.getTime() - next.getTime()) / 86_400_000);
}
