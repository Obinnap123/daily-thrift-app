/**
 * Unique Customer Code generation.
 * ----------------------------------------------------------------------------
 * Every customer gets a short, human-friendly reference code (e.g.
 * "DDT-000123") used on receipts, in search, and as the number staff read
 * out loud to customers. Backed by a real Postgres sequence
 * (`customer_code_seq`, created in the Step 3 migration) rather than reading
 * "MAX(customerCode) + 1" in application code — a sequence is atomic at the
 * database level, so two agents registering customers at the exact same
 * moment can NEVER be handed the same code, which a naive max+1 read could
 * allow under concurrent requests.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

const CODE_PREFIX = "DDT-";
const CODE_PAD_LENGTH = 6;

/** Draw the next value from the sequence and format it as "DDT-000123". */
export async function generateCustomerCode(): Promise<string> {
  const result = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('customer_code_seq') AS nextval
  `;
  const next = result[0].nextval;
  return `${CODE_PREFIX}${next.toString().padStart(CODE_PAD_LENGTH, "0")}`;
}
