/**
 * Pure financial metric helpers shared by repositories and unit tests.
 * Keeping the arithmetic here makes the dashboard definitions explicit and
 * prevents presentation code from silently changing accounting semantics.
 */
export function calculateAvailableBalance(
  lifetimeCollections: number,
  paidOutToCustomersAllTime: number,
): number {
  if (!Number.isFinite(lifetimeCollections) || !Number.isFinite(paidOutToCustomersAllTime)) {
    throw new Error("Financial totals must be finite numbers.");
  }

  return lifetimeCollections - paidOutToCustomersAllTime;
}
