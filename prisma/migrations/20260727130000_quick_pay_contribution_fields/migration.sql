-- CreateEnum
CREATE TYPE "ContributionPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- DropIndex
DROP INDEX "contributions_contributionPlanId_collectionDate_key";

-- AlterTable
ALTER TABLE "contributions" ADD COLUMN     "isOverride" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "overriddenById" TEXT,
ADD COLUMN     "overrideReason" TEXT,
ADD COLUMN     "paymentMethod" "ContributionPaymentMethod" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "receiptNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "contributions_receiptNumber_key" ON "contributions"("receiptNumber");

-- CreateIndex
CREATE INDEX "contributions_contributionPlanId_collectionDate_idx" ON "contributions"("contributionPlanId", "collectionDate");

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Partial unique index: replaces the old strict per-plan-per-day unique
-- constraint. Only applies to NON-override rows (isOverride = false), so a
-- normal duplicate is still blocked, but an Admin-approved override row can
-- coexist with the original same-day row for the same plan. Cannot be
-- expressed in schema.prisma (no partial-index syntax), so it is added here
-- as raw SQL — same technique already used for payout_receipt_seq below.
CREATE UNIQUE INDEX "contributions_plan_date_non_override_key"
  ON "contributions" ("contributionPlanId", "collectionDate")
  WHERE "isOverride" = false;

-- New Postgres sequence for auto-generated Contribution receipt numbers
-- (formatted as "CR-000123" by generateContributionReceiptNumber() in
-- lib/receipt-number.ts). Kept as its own sequence, separate from
-- payout_receipt_seq, so the two receipt number spaces never collide and
-- the already-shipped Payout feature's sequence is never touched.
CREATE SEQUENCE IF NOT EXISTS "contribution_receipt_seq" START WITH 1 INCREMENT BY 1;
