-- Customer-raised missing-payment cases. These records are operational
-- reports only and never mutate contributions or allocations automatically.

CREATE TYPE "MissingPaymentReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "missing_payment_reports" (
  "id" TEXT NOT NULL,
  "customerProfileId" TEXT NOT NULL,
  "contributionPlanId" TEXT,
  "paymentDate" DATE NOT NULL,
  "reportedAmount" DECIMAL(12,2) NOT NULL,
  "customerNote" TEXT,
  "status" "MissingPaymentReportStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedById" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "missing_payment_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "missing_payment_reports_status_createdAt_idx"
  ON "missing_payment_reports"("status", "createdAt");
CREATE INDEX "missing_payment_reports_customerProfileId_createdAt_idx"
  ON "missing_payment_reports"("customerProfileId", "createdAt");

-- One unresolved concern per customer/payment date prevents accidental
-- double-submission while still allowing a new report after a case closes.
CREATE UNIQUE INDEX "missing_payment_reports_one_open_per_customer_date"
  ON "missing_payment_reports"("customerProfileId", "paymentDate")
  WHERE "status" = 'OPEN';

ALTER TABLE "missing_payment_reports"
  ADD CONSTRAINT "missing_payment_reports_customerProfileId_fkey"
  FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "missing_payment_reports"
  ADD CONSTRAINT "missing_payment_reports_contributionPlanId_fkey"
  FOREIGN KEY ("contributionPlanId") REFERENCES "contribution_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "missing_payment_reports"
  ADD CONSTRAINT "missing_payment_reports_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
