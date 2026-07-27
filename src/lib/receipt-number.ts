/**
 * Unique Payout Receipt Number generation.
 * ----------------------------------------------------------------------------
 * Same reasoning as lib/customer-code.ts: backed by a real Postgres sequence
 * (`payout_receipt_seq`, created in the Step 4 migration) so two payouts
 * recorded at the same instant can never collide, and printed/exported
 * receipts always carry a stable, sequential reference number.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

const RECEIPT_PREFIX = "PR-";
const RECEIPT_PAD_LENGTH = 6;

/** Draw the next value from the sequence and format it as "PR-000045". */
export async function generateReceiptNumber(): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('payout_receipt_seq') AS nextval
  `;
  const next = result[0].nextval;
  return `${RECEIPT_PREFIX}${next.toString().padStart(RECEIPT_PAD_LENGTH, "0")}`;
}
