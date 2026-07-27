/**
 * Unique receipt number generation (Payouts and Contributions).
 * ----------------------------------------------------------------------------
 * Backed by real Postgres sequences (`payout_receipt_seq`, created in the
 * Step 4 migration; `contribution_receipt_seq`, created in the Quick Pay
 * migration) so two receipts recorded at the same instant can never
 * collide, and printed/exported receipts always carry a stable, sequential
 * reference number. Kept as two separate sequences (never shared) so the
 * Payout and Contribution receipt number spaces can never collide with
 * each other either.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

const PAYOUT_RECEIPT_PREFIX = "PR-";
const CONTRIBUTION_RECEIPT_PREFIX = "CR-";
const RECEIPT_PAD_LENGTH = 6;

/** Draw the next value from the sequence and format it as "PR-000045". */
export async function generateReceiptNumber(): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('payout_receipt_seq') AS nextval
  `;
  const next = result[0].nextval;
  return `${PAYOUT_RECEIPT_PREFIX}${next.toString().padStart(RECEIPT_PAD_LENGTH, "0")}`;
}

/**
 * Draw the next value from the Contribution receipt sequence and format it
 * as "CR-000123". Called by recordContribution() for every COLLECTED
 * payment (never for MISSED rows, which carry no receipt).
 */
export async function generateContributionReceiptNumber(): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('contribution_receipt_seq') AS nextval
  `;
  const next = result[0].nextval;
  return `${CONTRIBUTION_RECEIPT_PREFIX}${next.toString().padStart(RECEIPT_PAD_LENGTH, "0")}`;
}
