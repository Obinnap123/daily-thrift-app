import assert from "node:assert/strict";
import test from "node:test";
import { calculateContributionAllocation } from "../src/lib/contribution-allocation";
import { quickPaySchema } from "../src/validations/contribution";
import { quickPayRevalidationPaths } from "../src/lib/contribution-revalidation";
import {
  lockCustomerFinancialState,
  lockReconciliationState,
} from "../src/lib/financial-transaction";
import { calculateAvailableBalance } from "../src/lib/financial-metrics";
import {
  countUnfundedPastDays,
  resolveCollectionDayState,
} from "../src/lib/collection-day-state";
import { buildTrackingSheets } from "../src/lib/tracking";
import {
  reviewMissingPaymentReportSchema,
  submitMissingPaymentReportSchema,
} from "../src/validations/missing-payment-report";

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

test("a ₦3,000 payment at ₦500 per day covers six consecutive calendar cells", () => {
  const allocation = calculateContributionAllocation(500, 0, 3000);
  assert.equal(allocation.fullSlots, 6);

  const paidDates = Array.from({ length: allocation.fullSlots }, (_, index) =>
    new Date(Date.UTC(2026, 7, 20 + index)),
  );
  const [august] = buildTrackingSheets(
    new Date("2026-08-20T00:00:00.000Z"),
    paidDates,
    false,
    { asOf: new Date("2026-08-21T00:00:00.000Z") },
  );

  assert.deepEqual(
    august.cells.slice(19, 25).map((cell) => cell.state),
    ["paid", "paid", "paid", "paid", "paid", "paid"],
  );
});

test("an earlier payment allocation makes today covered in advance", () => {
  assert.equal(
    resolveCollectionDayState({
      businessDate: new Date("2026-08-21T00:00:00.000Z"),
      planStartDate: new Date("2026-08-20T00:00:00.000Z"),
      hasCoverageAllocation: true,
      coveragePaymentDate: new Date("2026-08-20T00:00:00.000Z"),
      contributionStatus: null,
    }),
    "COVERED_IN_ADVANCE",
  );
});

test("a future savings-period start is not treated as due or missed", () => {
  assert.equal(
    resolveCollectionDayState({
      businessDate: new Date("2026-08-21T00:00:00.000Z"),
      planStartDate: new Date("2026-08-24T00:00:00.000Z"),
      hasCoverageAllocation: false,
      contributionStatus: null,
    }),
    "NOT_STARTED",
  );
});

test("only unfunded dates before today count as outstanding", () => {
  assert.equal(
    countUnfundedPastDays(
      new Date("2026-08-19T00:00:00.000Z"),
      new Date("2026-08-21T00:00:00.000Z"),
    ),
    2,
  );
  assert.equal(
    countUnfundedPastDays(
      new Date("2026-08-24T00:00:00.000Z"),
      new Date("2026-08-21T00:00:00.000Z"),
    ),
    0,
  );
});

test("tracking marks past unfunded dates missed and invalid month dates unavailable", () => {
  const sheets = buildTrackingSheets(
    new Date("2026-09-01T00:00:00.000Z"),
    [new Date("2026-09-01T00:00:00.000Z")],
    false,
    { asOf: new Date("2026-09-03T00:00:00.000Z") },
  );

  assert.equal(sheets[0].cells[0].state, "paid");
  assert.equal(sheets[0].cells[1].state, "missed");
  assert.equal(sheets[0].cells[2].state, "pending");
  assert.equal(sheets[0].cells[30].state, "invalid");
});

test("missing-payment reports require a positive amount and valid payment date", () => {
  assert.equal(submitMissingPaymentReportSchema.safeParse({
    paymentDate: "2026-08-21",
    reportedAmount: 3000,
    customerNote: "Cash paid to my agent",
  }).success, true);
  assert.equal(submitMissingPaymentReportSchema.safeParse({
    paymentDate: "not-a-date",
    reportedAmount: 0,
  }).success, false);
});

test("closing a missing-payment report requires an admin review note", () => {
  assert.equal(reviewMissingPaymentReportSchema.safeParse({
    reportId: "report-1",
    decision: "RESOLVED",
    reviewNote: "Verified and corrected through Quick Pay.",
  }).success, true);
  assert.equal(reviewMissingPaymentReportSchema.safeParse({
    reportId: "report-1",
    decision: "DISMISSED",
    reviewNote: "",
  }).success, false);
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

test("available balance subtracts only net customer payouts from lifetime collections", () => {
  assert.equal(calculateAvailableBalance(100_000, 50_000), 50_000);
  assert.equal(calculateAvailableBalance(103_000, 50_000), 53_000);
});

test("available balance keeps commission because it is not part of the customer payout", () => {
  const lifetimeCollections = 50_000;
  const customerAmount = 49_500;

  assert.equal(calculateAvailableBalance(lifetimeCollections, customerAmount), 500);
});

test("available balance rejects invalid aggregate values", () => {
  assert.throws(() => calculateAvailableBalance(Number.NaN, 0));
  assert.throws(() => calculateAvailableBalance(1_000, Number.POSITIVE_INFINITY));
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
