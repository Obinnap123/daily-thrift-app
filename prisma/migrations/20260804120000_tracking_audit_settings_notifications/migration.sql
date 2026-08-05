-- Monthly tracker allocations, payout accounting, audit log, settings and notifications.

CREATE TYPE "AuditOutcome" AS ENUM ('SUCCESS', 'FAILURE');

ALTER TABLE "contribution_plans"
  ADD COLUMN "creditBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "nextCoverageDate" DATE,
  ADD COLUMN "endedAt" DATE;

ALTER TABLE "payouts"
  ADD COLUMN "grossSavings" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "commissionAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "customerAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "commissionDays" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "minimumPayoutSlots" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "lastCoveredDate" DATE;

UPDATE "payouts"
SET "grossSavings" = "totalSavings",
    "customerAmount" = "totalSavings";

-- A completed legacy plan without a payout is still an open savings period
-- under the new rules; reaching 31 days no longer blocks contributions.
UPDATE "contribution_plans" p
SET "status" = 'ACTIVE'
WHERE p."status" = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM "payouts" po WHERE po."contributionPlanId" = p."id"
  );

CREATE TABLE "contribution_allocations" (
  "id" TEXT NOT NULL,
  "contributionPlanId" TEXT NOT NULL,
  "contributionId" TEXT,
  "coverageDate" DATE NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contribution_allocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contribution_allocations_contributionPlanId_coverageDate_key"
  ON "contribution_allocations"("contributionPlanId", "coverageDate");
CREATE INDEX "contribution_allocations_contributionId_idx"
  ON "contribution_allocations"("contributionId");
CREATE INDEX "contribution_allocations_coverageDate_idx"
  ON "contribution_allocations"("coverageDate");

ALTER TABLE "contribution_allocations"
  ADD CONSTRAINT "contribution_allocations_contributionPlanId_fkey"
  FOREIGN KEY ("contributionPlanId") REFERENCES "contribution_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "contribution_allocations"
  ADD CONSTRAINT "contribution_allocations_contributionId_fkey"
  FOREIGN KEY ("contributionId") REFERENCES "contributions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill complete daily cells from the aggregate money already collected.
-- Legacy rows remain untouched; nullable contributionId marks these as a
-- migration-derived allocation rather than pretending one old receipt funded
-- a specific cell.
INSERT INTO "contribution_allocations" (
  "id", "contributionPlanId", "contributionId", "coverageDate", "amount"
)
SELECT
  'legacy-' || p."id" || '-' || gs.n,
  p."id",
  NULL,
  (p."startDate" + (gs.n - 1) * INTERVAL '1 day')::date,
  p."dailyAmount"
FROM "contribution_plans" p
CROSS JOIN LATERAL generate_series(
  1,
  FLOOR(COALESCE((
    SELECT SUM(c."amount") FROM "contributions" c
    WHERE c."contributionPlanId" = p."id" AND c."status" = 'COLLECTED'
  ), 0) / NULLIF(p."dailyAmount", 0))::integer
) AS gs(n)
ON CONFLICT DO NOTHING;

UPDATE "contribution_plans" p
SET "creditBalance" = MOD(
      COALESCE((SELECT SUM(c."amount") FROM "contributions" c
                WHERE c."contributionPlanId" = p."id" AND c."status" = 'COLLECTED'), 0),
      NULLIF(p."dailyAmount", 0)
    ),
    "nextCoverageDate" = p."startDate" + (
      SELECT COUNT(*) FROM "contribution_allocations" a
      WHERE a."contributionPlanId" = p."id"
    ) * INTERVAL '1 day';

CREATE TABLE "business_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "businessName" TEXT NOT NULL DEFAULT 'Davchuks Daily Thrift',
  "supportPhone" TEXT,
  "supportEmail" TEXT,
  "businessAddress" TEXT,
  "receiptFooter" TEXT,
  "minimumPayoutSlots" INTEGER NOT NULL DEFAULT 2,
  "commissionDays" INTEGER NOT NULL DEFAULT 1,
  "agentPayoutEnabled" BOOLEAN NOT NULL DEFAULT true,
  "notifyAdminOnAgentPayout" BOOLEAN NOT NULL DEFAULT true,
  "notifyAgentOnAdminPayout" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "business_settings" ("id") VALUES ('default');

CREATE TABLE "notifications" (
  "id" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "href" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_recipientId_readAt_createdAt_idx"
  ON "notifications"("recipientId", "readAt", "createdAt");
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "audit_logs" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "actorRole" "Role",
  "action" TEXT NOT NULL,
  "outcome" "AuditOutcome" NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");
CREATE INDEX "audit_logs_action_outcome_idx" ON "audit_logs"("action", "outcome");
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
