export interface ContributionAllocationResult {
  fullSlots: number;
  creditBalance: number;
}

/**
 * Pure contribution allocation math shared by the financial service and
 * unit tests. Money that cannot fill a complete daily slot remains as credit.
 */
export function calculateContributionAllocation(
  dailyAmount: number,
  existingCredit: number,
  paymentAmount: number,
): ContributionAllocationResult {
  if (!Number.isFinite(dailyAmount) || dailyAmount <= 0) {
    throw new Error("Daily amount must be greater than zero.");
  }
  if (!Number.isFinite(existingCredit) || existingCredit < 0) {
    throw new Error("Existing credit cannot be negative.");
  }
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const available = existingCredit + paymentAmount;
  const fullSlots = Math.floor((available + Number.EPSILON) / dailyAmount);
  const creditBalance = Number((available - fullSlots * dailyAmount).toFixed(2));

  return { fullSlots, creditBalance };
}
