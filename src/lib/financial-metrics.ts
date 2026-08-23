/**
 * Pure financial metric helpers shared by repositories and unit tests.
 * Keeping the arithmetic here makes the dashboard definitions explicit and
 * prevents presentation code from silently changing accounting semantics.
 */
export function calculateAvailableBalance(
  lifetimeCollections: number,
  grossSavingsClosedByPayouts: number,
): number {
  if (!Number.isFinite(lifetimeCollections) || !Number.isFinite(grossSavingsClosedByPayouts)) {
    throw new Error("Financial totals must be finite numbers.");
  }

  // A completed payout closes the customer's full saved amount. The amount
  // handed to the customer and the company's commission are both removed
  // from the pool of customer funds that is still available for payout.
  return lifetimeCollections - grossSavingsClosedByPayouts;
}
