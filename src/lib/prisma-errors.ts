const ACTIVE_PLAN_CONSTRAINT = "contribution_plans_one_active_per_customer_key";

type ErrorRecord = Record<string, unknown>;

function asRecord(value: unknown): ErrorRecord | null {
  return typeof value === "object" && value !== null ? (value as ErrorRecord) : null;
}

/**
 * Prisma's PostgreSQL adapter can expose unique violations either as P2002
 * or as a nested PostgreSQL 23505 driver error. Recognize both without
 * coupling application behavior to one adapter's private error classes.
 */
export function isActivePlanUniqueConflict(error: unknown): boolean {
  const outer = asRecord(error);
  if (!outer) return false;

  if (outer.code === "P2002") {
    const searchable = JSON.stringify(outer.meta ?? {});
    return (
      searchable.includes(ACTIVE_PLAN_CONSTRAINT) ||
      searchable.includes("customerProfileId") ||
      searchable.includes("ContributionPlan")
    );
  }

  let current: ErrorRecord | null = outer;
  for (let depth = 0; current && depth < 5; depth += 1) {
    if (
      current.code === "23505" &&
      (current.constraint === ACTIVE_PLAN_CONSTRAINT ||
        JSON.stringify(current).includes(ACTIVE_PLAN_CONSTRAINT))
    ) {
      return true;
    }
    current = asRecord(current.cause ?? current.originalError ?? current.driverAdapterError);
  }

  return false;
}

/** True for any PostgreSQL/Prisma unique-constraint violation. */
export function isUniqueConstraintConflict(error: unknown): boolean {
  let current = asRecord(error);
  for (let depth = 0; current && depth < 6; depth += 1) {
    if (current.code === "P2002" || current.code === "23505") return true;
    current = asRecord(current.cause ?? current.originalError ?? current.driverAdapterError);
  }
  return false;
}
