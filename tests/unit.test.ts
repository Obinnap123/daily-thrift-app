import assert from "node:assert/strict";
import test from "node:test";
import { parseSessionSecurityClaims, isSessionSecurityStateCurrent } from "../src/lib/session-revocation";
import { navigationForPath } from "../src/components/layout/navigation";
import { calculateContributionAllocation } from "../src/lib/contribution-allocation";
import { sendAgentInvitationEmail } from "../src/server/services/email.service";

test("Super Admin sessions are valid only while the account role and version match", () => {
  const claims = parseSessionSecurityClaims({ id: "owner-1", role: "SUPER_ADMIN", sessionVersion: 4 });
  assert.ok(claims);
  assert.equal(isSessionSecurityStateCurrent(claims, { isActive: true, role: "SUPER_ADMIN", sessionVersion: 4 }), true);
  assert.equal(isSessionSecurityStateCurrent(claims, { isActive: true, role: "ADMIN", sessionVersion: 4 }), false);
  assert.equal(isSessionSecurityStateCurrent(claims, { isActive: true, role: "SUPER_ADMIN", sessionVersion: 3 }), false);
});

test("Super Admin navigation is separate from Admin and Agent destinations", () => {
  assert.deepEqual(navigationForPath("/super-admin/admin").map((item) => item.href), ["/super-admin", "/super-admin/activity", "/super-admin/admin"]);
  assert.equal(navigationForPath("/admin")[0].href, "/admin");
  assert.equal(navigationForPath("/agent")[0].href, "/agent");
});

test("Admin invitation uses the staff email service with an Admin-specific link", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.RESEND_FROM_EMAIL;
  const sent: Array<{ to: string[]; subject: string; text: string }> = [];

  try {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "Davchuks <test@example.com>";
    globalThis.fetch = async (_input, init) => {
      sent.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: "test-email-id" }), { status: 200 });
    };

    const result = await sendAgentInvitationEmail({
      to: "new-admin@example.com",
      agentName: "New Admin",
      invitationToken: "test-token",
      applicationOrigin: "http://127.0.0.1:3001",
      role: "Admin",
      idempotencyKey: "admin-invite-test",
    });

    assert.equal(result.success, true);
    assert.deepEqual(sent[0]?.to, ["new-admin@example.com"]);
    assert.equal(sent[0]?.subject, "Verify your Davchuks admin account");
    assert.match(sent[0]?.text ?? "", /http:\/\/127\.0\.0\.1:3001\/verify-email\?token=test-token/);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = previousFrom;
  }
});
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
import {
  completeAgentInvitationSchema,
  createAgentSchema,
} from "../src/validations/auth";
import {
  createStaffVerificationToken,
  hashStaffVerificationToken,
} from "../src/lib/staff-verification-token";
import { resolveCustomerSupportContacts } from "../src/lib/customer-support-contact";
import {
  buildPayoutMonthOptions,
  calculatePayout,
} from "../src/lib/payout-selection";
import { previewRequiredMonthlyRates } from "../src/lib/monthly-rate-preview";
import { resolvePlanDailyRate } from "../src/lib/plan-daily-rate";
import {
  assessContributionCorrection,
  SETTLED_CORRECTION_MESSAGE,
  UNTRACEABLE_CORRECTION_MESSAGE,
} from "../src/lib/contribution-correction-safety";

test("the displayed daily rate follows the latest agreed month without rewriting the original plan rate", () => {
  const plan = {
    initialDailyAmount: 500,
    startDate: new Date("2026-08-01T00:00:00Z"),
    monthlyRates: [
      { monthStart: new Date("2026-08-01T00:00:00Z"), dailyAmount: 500 },
      { monthStart: new Date("2026-09-01T00:00:00Z"), dailyAmount: 1000 },
    ],
  };
  assert.deepEqual(resolvePlanDailyRate({ ...plan, coverageDate: new Date("2026-08-21T00:00:00Z") }), { dailyAmount: 500, month: "2026-08" });
  assert.deepEqual(resolvePlanDailyRate({ ...plan, coverageDate: new Date("2026-09-17T00:00:00Z") }), { dailyAmount: 1000, month: "2026-09" });
  assert.deepEqual(resolvePlanDailyRate({ ...plan, coverageDate: new Date("2026-10-02T00:00:00Z") }), { dailyAmount: 1000, month: "2026-09" });
});
import { recordPayoutSchema } from "../src/validations/payout";
import {
  applyContributionCorrectionSchema,
  reviewContributionCorrectionSchema,
} from "../src/validations/contribution-correction";

test("a fully allocated payment in an unpaid month can be corrected after another month was paid out", () => {
  const result = assessContributionCorrection({
    amount: 1000,
    allocations: [{ coverageDate: new Date("2026-10-02T00:00:00Z"), amount: 1000, payoutMonthId: null }],
    payoutCount: 1,
    settledMonths: [{ monthStart: new Date("2026-09-01T00:00:00Z"), creditAmount: 0 }],
    hasOrphanAllocations: false,
  });
  assert.equal(result.error, null);
  assert.deepEqual([...result.settledMonthKeys], ["2026-09"]);
});

test("a contribution touching a paid month remains locked even if another month is unpaid", () => {
  const result = assessContributionCorrection({
    amount: 2000,
    allocations: [
      { coverageDate: new Date("2026-09-30T00:00:00Z"), amount: 1000, payoutMonthId: null },
      { coverageDate: new Date("2026-10-01T00:00:00Z"), amount: 1000, payoutMonthId: null },
    ],
    payoutCount: 1,
    settledMonths: [{ monthStart: new Date("2026-09-01T00:00:00Z"), creditAmount: 0 }],
    hasOrphanAllocations: false,
  });
  assert.equal(result.error, SETTLED_CORRECTION_MESSAGE);
});

test("payout credit and unallocated payment remainders are not treated as proven unpaid money", () => {
  const base = {
    amount: 1000,
    allocations: [{ coverageDate: new Date("2026-10-01T00:00:00Z"), amount: 1000, payoutMonthId: null }],
    payoutCount: 1,
    settledMonths: [{ monthStart: new Date("2026-09-01T00:00:00Z"), creditAmount: 0 }],
    hasOrphanAllocations: false,
  };
  assert.equal(assessContributionCorrection({ ...base, amount: 1500 }).error, UNTRACEABLE_CORRECTION_MESSAGE);
  assert.equal(assessContributionCorrection({ ...base, settledMonths: [{ ...base.settledMonths[0], creditAmount: 500 }] }).error, UNTRACEABLE_CORRECTION_MESSAGE);
  assert.equal(assessContributionCorrection({ ...base, hasOrphanAllocations: true }).error, UNTRACEABLE_CORRECTION_MESSAGE);
});

test("customer support uses one shared call and WhatsApp number when no override is set", () => {
  assert.deepEqual(
    resolveCustomerSupportContacts({ supportPhone: "0803 123 4567", supportWhatsApp: "" }),
    {
      callNumber: "0803 123 4567",
      whatsappNumber: "2348031234567",
    },
  );
});

test("a separate WhatsApp setting overrides only the WhatsApp contact", () => {
  assert.deepEqual(
    resolveCustomerSupportContacts({
      supportPhone: "0803 123 4567",
      supportWhatsApp: "+234 812 555 0199",
    }),
    {
      callNumber: "0803 123 4567",
      whatsappNumber: "2348125550199",
    },
  );
});

test("Quick Pay accepts a native date-input value and converts it to a Date", () => {
  const result = quickPaySchema.parse({
    customerProfileId: "customer-1",
    amount: "2000",
    paymentMethod: "CASH",
    paymentDate: "2026-08-17",
    clientRequestId: "e7b93ddd-11ca-4f37-a08b-9714bd036067",
  });

  assert.equal(result.amount, 2000);
  assert.equal(result.paymentDate?.toISOString(), "2026-08-17T00:00:00.000Z");
});

test("Quick Pay accepts an explicitly confirmed additional same-day payment", () => {
  const result = quickPaySchema.safeParse({
    customerProfileId: "customer-1",
    amount: 500,
    paymentMethod: "CASH",
    paymentDate: "2026-08-17",
    confirmAdditionalPayment: true,
    clientRequestId: "e7b93ddd-11ca-4f37-a08b-9714bd036067",
  });

  assert.equal(result.success, true);
});

test("Quick Pay rejects a malformed request token", () => {
  const result = quickPaySchema.safeParse({
    customerProfileId: "customer-1",
    amount: 500,
    paymentMethod: "CASH",
    clientRequestId: "not-a-uuid",
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

test("an Admin creates an Agent invitation without choosing the Agent's password", () => {
  const result = createAgentSchema.safeParse({
    name: "Verified Agent",
    email: "AGENT@example.com",
    phone: "0803 123 4567",
  });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.data.email, "agent@example.com");
});

test("agent invitation completion enforces the shared password policy", () => {
  const token = "a".repeat(43);
  assert.equal(completeAgentInvitationSchema.safeParse({
    token,
    password: "StrongPass1",
    confirmPassword: "StrongPass1",
  }).success, true);
  assert.equal(completeAgentInvitationSchema.safeParse({
    token,
    password: "weak",
    confirmPassword: "weak",
  }).success, false);
});

test("staff invitation tokens are random, hashed, and expire after 48 hours", () => {
  const now = new Date("2026-08-21T10:00:00.000Z");
  const first = createStaffVerificationToken(now);
  const second = createStaffVerificationToken(now);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashStaffVerificationToken(first.token));
  assert.notEqual(first.tokenHash, first.token);
  assert.equal(first.expiresAt.toISOString(), "2026-08-23T10:00:00.000Z");
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

test("available balance keeps savings belonging to customers who have not been paid out", () => {
  assert.equal(calculateAvailableBalance(100_000, 60_000), 40_000);
  assert.equal(calculateAvailableBalance(110_000, 60_000), 50_000);
});

test("available balance removes both the customer amount and commission after payout", () => {
  const lifetimeCollections = 50_000;
  const grossSavingsClosedByPayouts = 50_000;

  assert.equal(
    calculateAvailableBalance(lifetimeCollections, grossSavingsClosedByPayouts),
    0,
  );
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

test("Quick Pay accepts one daily payment when amount equals the monthly rate", () => {
  const parsed = quickPaySchema.safeParse({
    customerProfileId: "customer-1",
    amount: 500,
    monthlyDailyAmount: 500,
    monthlyRates: [],
    paymentMethod: "CASH",
    paymentDate: "2026-09-09",
    clientRequestId: "e7b93ddd-11ca-4f37-a08b-9714bd036068",
  });

  assert.equal(parsed.success, true);
  assert.deepEqual(calculateContributionAllocation(500, 0, 500), {
    fullSlots: 1,
    creditBalance: 0,
  });
});

test("partial payout can select February while leaving January unpaid", () => {
  const months = buildPayoutMonthOptions({
    allocations: [
      { id: "jan-1", coverageDate: new Date("2026-01-10T00:00:00.000Z"), amount: 500 },
      { id: "jan-2", coverageDate: new Date("2026-01-11T00:00:00.000Z"), amount: 500 },
      { id: "feb-1", coverageDate: new Date("2026-02-01T00:00:00.000Z"), amount: 1000 },
      { id: "feb-2", coverageDate: new Date("2026-02-02T00:00:00.000Z"), amount: 1000 },
    ],
    rates: [
      { monthStart: new Date("2026-01-01T00:00:00.000Z"), dailyAmount: 500 },
      { monthStart: new Date("2026-02-01T00:00:00.000Z"), dailyAmount: 1000 },
    ],
    planDailyAmount: 500,
    creditBalance: 0,
    nextCoverageDate: new Date("2026-02-03T00:00:00.000Z"),
  });

  const payout = calculatePayout({ months, mode: "PARTIAL", requestedMonths: [{ month: "2026-02", customerAmount: 1000 }], commissionDays: 1 });
  assert.equal(payout.grossSavings, 2000);
  assert.equal(payout.commissionAmount, 1000);
  assert.equal(payout.customerAmount, 1000);
  assert.equal(payout.remainingBalance, 1000);
  assert.deepEqual(payout.breakdown.map((month) => month.key), ["2026-02"]);
});

test("payout commission is one daily rate for every selected month", () => {
  const months = buildPayoutMonthOptions({
    allocations: [
      { id: "jan-1", coverageDate: new Date("2026-01-01T00:00:00.000Z"), amount: 500 },
      { id: "jan-2", coverageDate: new Date("2026-01-02T00:00:00.000Z"), amount: 500 },
      { id: "feb-1", coverageDate: new Date("2026-02-01T00:00:00.000Z"), amount: 1000 },
      { id: "feb-2", coverageDate: new Date("2026-02-02T00:00:00.000Z"), amount: 1000 },
    ],
    rates: [
      { monthStart: new Date("2026-01-01T00:00:00.000Z"), dailyAmount: 500 },
      { monthStart: new Date("2026-02-01T00:00:00.000Z"), dailyAmount: 1000 },
    ],
    planDailyAmount: 500,
    creditBalance: 0,
    nextCoverageDate: new Date("2026-02-03T00:00:00.000Z"),
  });

  const payout = calculatePayout({ months, mode: "FULL", requestedMonths: [], commissionDays: 1 });
  assert.equal(payout.commissionAmount, 1500);
  assert.equal(payout.grossSavings, 3000);
  assert.equal(payout.customerAmount, 1500);
});

test("an incomplete month remains eligible for explicit selection", () => {
  const result = recordPayoutSchema.safeParse({
    contributionPlanId: "plan-1",
    clientRequestId: "e7b93ddd-11ca-4f37-a08b-9714bd036068",
    mode: "PARTIAL",
    requestedMonths: [{ month: "2026-02", customerAmount: 300 }],
    payoutMethod: "CASH",
    payoutDate: "2026-02-15",
    note: "Customer requested the funded part of February.",
  });
  assert.equal(result.success, true);
});

test("exact partial cash-out uses one month's commission and preserves its remainder", () => {
  const allocations = Array.from({ length: 30 }, (_, index) => ({
    id: `sep-${index}`,
    coverageDate: new Date(Date.UTC(2026, 8, index + 1)),
    amount: 500,
  }));
  const base = {
    allocations,
    rates: [{ monthStart: new Date("2026-09-01T00:00:00.000Z"), dailyAmount: 500 }],
    planDailyAmount: 500,
    creditBalance: 0,
    nextCoverageDate: new Date("2026-10-01T00:00:00.000Z"),
  };
  const first = calculatePayout({
    months: buildPayoutMonthOptions(base), mode: "PARTIAL",
    requestedMonths: [{ month: "2026-09", customerAmount: 3000 }], commissionDays: 1,
  });
  assert.equal(first.grossSavings, 3500);
  assert.equal(first.commissionAmount, 500);
  assert.equal(first.remainingBalance, 11500);

  const remaining = buildPayoutMonthOptions({
    ...base,
    priorPayoutMonths: [{ monthStart: new Date("2026-09-01T00:00:00.000Z"), grossSavings: 3500, creditAmount: 0, commissionAmount: 500 }],
  });
  assert.equal(remaining[0].grossSavings, 11500);
  const second = calculatePayout({ months: remaining, mode: "FULL", requestedMonths: [], commissionDays: 1 });
  assert.equal(second.commissionAmount, 0);
  assert.equal(second.customerAmount, 11500);
});

test("partial cash-out from two months charges each different rate separately", () => {
  const months = buildPayoutMonthOptions({
    allocations: [
      { id: "jan-1", coverageDate: new Date("2026-01-01T00:00:00.000Z"), amount: 500 },
      { id: "jan-2", coverageDate: new Date("2026-01-02T00:00:00.000Z"), amount: 500 },
      { id: "feb-1", coverageDate: new Date("2026-02-01T00:00:00.000Z"), amount: 1000 },
      { id: "feb-2", coverageDate: new Date("2026-02-02T00:00:00.000Z"), amount: 1000 },
    ],
    rates: [
      { monthStart: new Date("2026-01-01T00:00:00.000Z"), dailyAmount: 500 },
      { monthStart: new Date("2026-02-01T00:00:00.000Z"), dailyAmount: 1000 },
    ],
    planDailyAmount: 500, creditBalance: 0,
    nextCoverageDate: new Date("2026-02-03T00:00:00.000Z"),
  });
  const payout = calculatePayout({ months, mode: "PARTIAL", commissionDays: 1,
    requestedMonths: [{ month: "2026-01", customerAmount: 250 }, { month: "2026-02", customerAmount: 500 }],
  });
  assert.equal(payout.commissionAmount, 1500);
  assert.equal(payout.customerAmount, 750);
  assert.equal(payout.remainingBalance, 750);
});

test("Quick Pay identifies every new month whose rate must be confirmed", () => {
  const endsExactlyAtMonthBoundary = previewRequiredMonthlyRates({
    nextCoverageDate: new Date("2026-01-31T00:00:00.000Z"),
    availableAmount: 500,
    fallbackDailyAmount: 500,
    knownRates: [{ month: "2026-01", dailyAmount: 500, locked: true }],
  });
  assert.deepEqual(endsExactlyAtMonthBoundary, []);

  const required = previewRequiredMonthlyRates({
    nextCoverageDate: new Date("2026-01-30T00:00:00.000Z"),
    availableAmount: 3000,
    fallbackDailyAmount: 500,
    knownRates: [{ month: "2026-01", dailyAmount: 500, locked: true }],
  });

  assert.deepEqual(required, [{ month: "2026-02", dailyAmount: 500 }]);
  const changed = previewRequiredMonthlyRates({
    nextCoverageDate: new Date("2026-01-30T00:00:00.000Z"),
    availableAmount: 3000,
    fallbackDailyAmount: 500,
    knownRates: [{ month: "2026-01", dailyAmount: 500, locked: true }],
    choices: [{ month: "2026-02", dailyAmount: 1000 }],
  });
  assert.deepEqual(changed, [{ month: "2026-02", dailyAmount: 1000 }]);

  const temporarilyCleared = previewRequiredMonthlyRates({
    nextCoverageDate: new Date("2026-01-30T00:00:00.000Z"),
    availableAmount: 3000,
    fallbackDailyAmount: 500,
    knownRates: [{ month: "2026-01", dailyAmount: 500, locked: true }],
    choices: [{ month: "2026-02", dailyAmount: 0 }],
  });
  assert.deepEqual(temporarilyCleared, [{ month: "2026-02", dailyAmount: 500 }]);

  const changedToHigherRate = previewRequiredMonthlyRates({
    nextCoverageDate: new Date("2026-02-01T00:00:00.000Z"),
    availableAmount: 500,
    fallbackDailyAmount: 500,
    knownRates: [],
    choices: [{ month: "2026-02", dailyAmount: 1000 }],
  });
  assert.deepEqual(changedToHigherRate, [{ month: "2026-02", dailyAmount: 1000 }]);
});

test("correction approval requires a reason only when rejected", () => {
  assert.equal(reviewContributionCorrectionSchema.safeParse({
    correctionRequestId: "request-1",
    decision: "APPROVED",
    reviewNote: "",
  }).success, true);
  assert.equal(reviewContributionCorrectionSchema.safeParse({
    correctionRequestId: "request-1",
    decision: "REJECTED",
    reviewNote: "",
  }).success, false);
});

test("an approved payment correction requires a positive replacement amount", () => {
  assert.equal(applyContributionCorrectionSchema.safeParse({
    correctionRequestId: "request-1",
    correctedAmount: 1000,
    correctedPaymentMethod: "CASH",
    correctedNote: "Corrected agent entry.",
  }).success, true);
  assert.equal(applyContributionCorrectionSchema.safeParse({
    correctionRequestId: "request-1",
    correctedAmount: 0,
    correctedPaymentMethod: "CASH",
  }).success, false);
});
