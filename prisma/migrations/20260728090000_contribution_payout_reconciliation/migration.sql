-- CreateEnum
CREATE TYPE "ContributionStatus" AS ENUM ('COLLECTED', 'MISSED');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'PAID_OUT');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "ReconciliationStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "contribution_plans" (
    "id" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "dailyAmount" DECIMAL(12,2) NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 31,
    "startDate" DATE NOT NULL,
    "expectedMaturityDate" DATE NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contribution_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" TEXT NOT NULL,
    "contributionPlanId" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "collectedById" TEXT NOT NULL,
    "collectionDate" DATE NOT NULL,
    "status" "ContributionStatus" NOT NULL,
    "amount" DECIMAL(12,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reconciliations" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "reconciliationDate" DATE NOT NULL,
    "expectedCash" DECIMAL(12,2) NOT NULL,
    "actualCash" DECIMAL(12,2) NOT NULL,
    "agentNote" TEXT,
    "status" "ReconciliationStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "contributionPlanId" TEXT NOT NULL,
    "customerProfileId" TEXT NOT NULL,
    "totalSavings" DECIMAL(12,2) NOT NULL,
    "payoutMethod" "PayoutMethod" NOT NULL,
    "payoutDate" DATE NOT NULL,
    "approvedById" TEXT NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contribution_plans_customerProfileId_idx" ON "contribution_plans"("customerProfileId");

-- CreateIndex
CREATE INDEX "contribution_plans_status_idx" ON "contribution_plans"("status");

-- CreateIndex
CREATE INDEX "contributions_customerProfileId_idx" ON "contributions"("customerProfileId");

-- CreateIndex
CREATE INDEX "contributions_collectedById_collectionDate_idx" ON "contributions"("collectedById", "collectionDate");

-- CreateIndex
CREATE INDEX "contributions_collectionDate_idx" ON "contributions"("collectionDate");

-- CreateIndex
CREATE UNIQUE INDEX "contributions_contributionPlanId_collectionDate_key" ON "contributions"("contributionPlanId", "collectionDate");

-- CreateIndex
CREATE INDEX "daily_reconciliations_status_idx" ON "daily_reconciliations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reconciliations_agentId_reconciliationDate_key" ON "daily_reconciliations"("agentId", "reconciliationDate");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_contributionPlanId_key" ON "payouts"("contributionPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "payouts_receiptNumber_key" ON "payouts"("receiptNumber");

-- CreateIndex
CREATE INDEX "payouts_customerProfileId_idx" ON "payouts"("customerProfileId");

-- CreateIndex
CREATE INDEX "payouts_payoutDate_idx" ON "payouts"("payoutDate");

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_contributionPlanId_fkey" FOREIGN KEY ("contributionPlanId") REFERENCES "contribution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_collectedById_fkey" FOREIGN KEY ("collectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reconciliations" ADD CONSTRAINT "daily_reconciliations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reconciliations" ADD CONSTRAINT "daily_reconciliations_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_contributionPlanId_fkey" FOREIGN KEY ("contributionPlanId") REFERENCES "contribution_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_customerProfileId_fkey" FOREIGN KEY ("customerProfileId") REFERENCES "customer_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CreateSequence
-- Backs Payout.receiptNumber generation (e.g. "PR-000045"), same atomic
-- nextval() pattern as customer_code_seq (Step 3) — never MAX()+1.
CREATE SEQUENCE IF NOT EXISTS "payout_receipt_seq" START WITH 1 INCREMENT BY 1;
