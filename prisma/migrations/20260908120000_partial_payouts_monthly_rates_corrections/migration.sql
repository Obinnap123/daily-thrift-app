-- Preserve the former government-ID value while giving it its correct
-- business meaning: this is the customer's physical thrift-card number.
ALTER TABLE "customer_profiles" RENAME COLUMN "idNumber" TO "customerNumber";
ALTER INDEX "customer_profiles_idNumber_key" RENAME TO "customer_profiles_customerNumber_key";

CREATE TYPE "PayoutScope" AS ENUM ('PARTIAL', 'FULL');
CREATE TYPE "ContributionCorrectionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'APPLIED', 'REJECTED', 'EXPIRED');

CREATE TABLE "contribution_month_rates" (
  "id" TEXT NOT NULL,
  "contributionPlanId" TEXT NOT NULL,
  "monthStart" DATE NOT NULL,
  "dailyAmount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contribution_month_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contribution_month_rates_contributionPlanId_monthStart_key"
  ON "contribution_month_rates"("contributionPlanId", "monthStart");
CREATE INDEX "contribution_month_rates_monthStart_idx"
  ON "contribution_month_rates"("monthStart");
ALTER TABLE "contribution_month_rates"
  ADD CONSTRAINT "contribution_month_rates_contributionPlanId_fkey"
  FOREIGN KEY ("contributionPlanId") REFERENCES "contribution_plans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Every historical month starts with the plan's original daily rate. New
-- months can subsequently receive their own rate through the application.
INSERT INTO "contribution_month_rates" (
  "id", "contributionPlanId", "monthStart", "dailyAmount", "updatedAt"
)
SELECT
  'cmr_' || md5(months."contributionPlanId" || months."monthStart"::text),
  months."contributionPlanId",
  months."monthStart",
  cp."dailyAmount",
  CURRENT_TIMESTAMP
FROM (
  SELECT id AS "contributionPlanId", date_trunc('month', "startDate")::date AS "monthStart"
  FROM "contribution_plans"
  UNION
  SELECT "contributionPlanId", date_trunc('month', "coverageDate")::date
  FROM "contribution_allocations"
  UNION
  SELECT id, date_trunc('month', "nextCoverageDate")::date
  FROM "contribution_plans"
  WHERE "nextCoverageDate" IS NOT NULL
) months
JOIN "contribution_plans" cp ON cp.id = months."contributionPlanId";

ALTER TABLE "payouts"
  ADD COLUMN "scope" "PayoutScope" NOT NULL DEFAULT 'FULL',
  ADD COLUMN "remainingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

DROP INDEX "payouts_contributionPlanId_key";
CREATE INDEX "payouts_contributionPlanId_idx" ON "payouts"("contributionPlanId");

CREATE TABLE "payout_months" (
  "id" TEXT NOT NULL,
  "payoutId" TEXT NOT NULL,
  "monthStart" DATE NOT NULL,
  "dailyAmount" DECIMAL(12,2) NOT NULL,
  "grossSavings" DECIMAL(12,2) NOT NULL,
  "commissionAmount" DECIMAL(12,2) NOT NULL,
  "customerAmount" DECIMAL(12,2) NOT NULL,
  "fundedSlots" INTEGER NOT NULL,
  "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payout_months_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payout_months_payoutId_monthStart_key"
  ON "payout_months"("payoutId", "monthStart");
CREATE INDEX "payout_months_monthStart_idx" ON "payout_months"("monthStart");
ALTER TABLE "payout_months"
  ADD CONSTRAINT "payout_months_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "payouts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill a truthful per-calendar-month breakdown for every historical
-- payout. Any legacy partial-cell credit is attached to the latest month;
-- the legacy one-time commission is also kept exactly as originally stored.
WITH allocation_months AS (
  SELECT
    p.id AS "payoutId",
    p."contributionPlanId",
    date_trunc('month', a."coverageDate")::date AS "monthStart",
    SUM(a.amount)::numeric(12,2) AS "allocationGross",
    COUNT(*)::integer AS "fundedSlots"
  FROM "payouts" p
  JOIN "contribution_allocations" a
    ON a."contributionPlanId" = p."contributionPlanId"
  GROUP BY p.id, p."contributionPlanId", date_trunc('month', a."coverageDate")::date
), ranked AS (
  SELECT
    am.*,
    p."grossSavings" AS "payoutGross",
    p."commissionAmount" AS "payoutCommission",
    cp."dailyAmount",
    ROW_NUMBER() OVER (PARTITION BY am."payoutId" ORDER BY am."monthStart" DESC) AS rn,
    SUM(am."allocationGross") OVER (PARTITION BY am."payoutId") AS "totalAllocationGross"
  FROM allocation_months am
  JOIN "payouts" p ON p.id = am."payoutId"
  JOIN "contribution_plans" cp ON cp.id = am."contributionPlanId"
)
INSERT INTO "payout_months" (
  "id", "payoutId", "monthStart", "dailyAmount", "grossSavings",
  "commissionAmount", "customerAmount", "fundedSlots", "creditAmount"
)
SELECT
  'pm_' || md5("payoutId" || "monthStart"::text),
  "payoutId",
  "monthStart",
  "dailyAmount",
  ("allocationGross" + CASE WHEN rn = 1 THEN GREATEST("payoutGross" - "totalAllocationGross", 0) ELSE 0 END)::numeric(12,2),
  (CASE WHEN rn = 1 THEN "payoutCommission" ELSE 0 END)::numeric(12,2),
  ("allocationGross" + CASE WHEN rn = 1 THEN GREATEST("payoutGross" - "totalAllocationGross", 0) - "payoutCommission" ELSE 0 END)::numeric(12,2),
  "fundedSlots",
  (CASE WHEN rn = 1 THEN GREATEST("payoutGross" - "totalAllocationGross", 0) ELSE 0 END)::numeric(12,2)
FROM ranked;

ALTER TABLE "contribution_allocations" ADD COLUMN "payoutMonthId" TEXT;
UPDATE "contribution_allocations" a
SET "payoutMonthId" = pm.id
FROM "payout_months" pm
JOIN "payouts" p ON p.id = pm."payoutId"
WHERE a."contributionPlanId" = p."contributionPlanId"
  AND date_trunc('month', a."coverageDate")::date = pm."monthStart";
CREATE INDEX "contribution_allocations_payoutMonthId_idx"
  ON "contribution_allocations"("payoutMonthId");
ALTER TABLE "contribution_allocations"
  ADD CONSTRAINT "contribution_allocations_payoutMonthId_fkey"
  FOREIGN KEY ("payoutMonthId") REFERENCES "payout_months"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "contribution_correction_requests" (
  "id" TEXT NOT NULL,
  "contributionId" TEXT NOT NULL,
  "customerProfileId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "status" "ContributionCorrectionStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestReason" TEXT NOT NULL,
  "reviewNote" TEXT,
  "approvedAt" TIMESTAMP(3),
  "editWindowEndsAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "originalAmount" DECIMAL(12,2) NOT NULL,
  "correctedAmount" DECIMAL(12,2),
  "originalPaymentMethod" "ContributionPaymentMethod" NOT NULL,
  "correctedPaymentMethod" "ContributionPaymentMethod",
  "originalNote" TEXT,
  "correctedNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "contribution_correction_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contribution_correction_requests_status_createdAt_idx"
  ON "contribution_correction_requests"("status", "createdAt");
CREATE INDEX "contribution_correction_requests_requestedById_status_idx"
  ON "contribution_correction_requests"("requestedById", "status");
CREATE INDEX "contribution_correction_requests_contributionId_idx"
  ON "contribution_correction_requests"("contributionId");

ALTER TABLE "contribution_correction_requests"
  ADD CONSTRAINT "contribution_correction_requests_contributionId_fkey"
  FOREIGN KEY ("contributionId") REFERENCES "contributions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contribution_correction_requests"
  ADD CONSTRAINT "contribution_correction_requests_customerProfileId_fkey"
  FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contribution_correction_requests"
  ADD CONSTRAINT "contribution_correction_requests_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contribution_correction_requests"
  ADD CONSTRAINT "contribution_correction_requests_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
