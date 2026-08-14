import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

const MAX_TRANSACTION_ATTEMPTS = 3;

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.code === "string") return record.code;
  return errorCode(record.cause ?? record.originalError ?? record.driverAdapterError);
}

function isRetryableTransactionError(error: unknown): boolean {
  const code = errorCode(error);
  return code === "P2034" || code === "40001" || code === "40P01";
}

/**
 * Run a financial mutation at PostgreSQL's strictest isolation level.
 * Serialization failures and deadlocks are safe to retry because PostgreSQL
 * has rolled the failed attempt back in full.
 */
export async function runFinancialTransaction<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(operation, { isolationLevel: "Serializable" });
    } catch (error) {
      if (!isRetryableTransactionError(error) || attempt === MAX_TRANSACTION_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw new Error("Financial transaction retry limit exceeded.");
}

/**
 * Serialize every balance-changing operation for one customer. An advisory
 * transaction lock also works when the customer does not yet have an active
 * plan row to lock, and PostgreSQL releases it automatically on commit/rollback.
 */
export async function lockCustomerFinancialState(
  tx: Prisma.TransactionClient,
  customerProfileId: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`customer:${customerProfileId}`}, 0))
  `;
}

/** Serialize one agent/day reconciliation submission. */
export async function lockReconciliationState(
  tx: Prisma.TransactionClient,
  agentId: string,
  reconciliationDate: Date,
): Promise<void> {
  const day = reconciliationDate.toISOString().slice(0, 10);
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${`reconciliation:${agentId}:${day}`}, 0))
  `;
}
