import assert from "node:assert/strict";
import test from "node:test";
import { calculateContributionAllocation } from "../src/lib/contribution-allocation";
import { quickPaySchema } from "../src/validations/contribution";
import { quickPayRevalidationPaths } from "../src/lib/contribution-revalidation";
import {
  lockCustomerFinancialState,
  lockReconciliationState,
} from "../src/lib/financial-transaction";

test("Quick Pay accepts a native date-input value and converts it to a Date", () => {
  const result = quickPaySchema.parse({
    customerProfileId: "customer-1",
    amount: "2000",
    paymentMethod: "CASH",
    paymentDate: "2026-08-17",
    isOverride: false,
  });

  assert.equal(result.amount, 2000);
  assert.equal(result.paymentDate?.toISOString(), "2026-08-17T00:00:00.000Z");
});

test("Quick Pay requires a reason for an Admin override", () => {
  const result = quickPaySchema.safeParse({
    customerProfileId: "customer-1",
    amount: 500,
    paymentMethod: "CASH",
    paymentDate: "2026-08-17",
    isOverride: true,
    overrideReason: "",
  });

  assert.equal(result.success, false);
});

test("a ₦2,000 payment at ₦500 per day funds four slots", () => {
  assert.deepEqual(calculateContributionAllocation(500, 0, 2000), {
    fullSlots: 4,
    creditBalance: 0,
  });
});

test("partial money is retained as credit and completes the next slot", () => {
  assert.deepEqual(calculateContributionAllocation(500, 200, 800), {
    fullSlots: 2,
    creditBalance: 0,
  });
  assert.deepEqual(calculateContributionAllocation(500, 0, 200), {
    fullSlots: 0,
    creditBalance: 200,
  });
});

test("allocation rejects invalid financial inputs", () => {
  assert.throws(() => calculateContributionAllocation(0, 0, 500));
  assert.throws(() => calculateContributionAllocation(500, -1, 500));
  assert.throws(() => calculateContributionAllocation(500, 0, 0));
});

test("Quick Pay refreshes every screen where a payment must be reflected", () => {
  assert.deepEqual(quickPayRevalidationPaths("customer-1"), [
    "/admin",
    "/agent",
    "/agent/collections",
    "/admin/customers/customer-1",
    "/agent/customers/customer-1",
    "/admin/payouts",
    "/customer",
    "/admin/tracking",
    "/agent/tracking",
  ]);
});

test("customer financial lock casts PostgreSQL void to text", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join("?"), values });
      return [{ lockResult: "" }];
    },
  };

  await lockCustomerFinancialState(tx as never, "customer-1");

  assert.match(calls[0].sql, /pg_advisory_xact_lock/);
  assert.match(calls[0].sql, /::text AS "lockResult"/);
  assert.deepEqual(calls[0].values, ["customer:customer-1"]);
});

test("reconciliation lock also casts PostgreSQL void to text", async () => {
  const calls: { sql: string; values: unknown[] }[] = [];
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      calls.push({ sql: strings.join("?"), values });
      return [{ lockResult: "" }];
    },
  };

  await lockReconciliationState(
    tx as never,
    "agent-1",
    new Date("2026-08-17T00:00:00.000Z"),
  );

  assert.match(calls[0].sql, /pg_advisory_xact_lock/);
  assert.match(calls[0].sql, /::text AS "lockResult"/);
  assert.deepEqual(calls[0].values, ["reconciliation:agent-1:2026-08-17"]);
});
