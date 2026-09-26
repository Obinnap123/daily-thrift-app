-- Preserve former Admin accounts without deleting audit or financial history.
ALTER TABLE "users" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "users"
  ADD CONSTRAINT "users_archived_not_active_check"
  CHECK ("archivedAt" IS NULL OR "isActive" = false);
ALTER TABLE "staff_email_verification_tokens" ADD COLUMN "deliveredAt" TIMESTAMP(3);
UPDATE "staff_email_verification_tokens" SET "deliveredAt" = "createdAt";

-- More than one pending token may temporarily exist while a replacement email
-- is being delivered. Older tokens are removed only after delivery succeeds.
DROP INDEX IF EXISTS "staff_email_verification_tokens_userId_key";
CREATE INDEX "staff_email_verification_tokens_userId_createdAt_idx"
  ON "staff_email_verification_tokens"("userId", "createdAt");

-- The application lock protects normal UI requests; this partial unique index
-- protects the invariant from scripts, future code paths, and concurrent hosts.
CREATE UNIQUE INDEX "users_one_active_admin_idx"
  ON "users" ("role")
  WHERE "role" = 'ADMIN' AND "isActive" = true AND "archivedAt" IS NULL;

-- Indexes match the Super Admin activity feed's filters and keyset ordering.
CREATE INDEX "audit_logs_actorRole_createdAt_id_idx"
  ON "audit_logs"("actorRole", "createdAt", "id");
CREATE INDEX "audit_logs_actorRole_outcome_createdAt_id_idx"
  ON "audit_logs"("actorRole", "outcome", "createdAt", "id");
CREATE INDEX "audit_logs_search_idx"
  ON "audit_logs" USING GIN (
    to_tsvector('simple', COALESCE("action", '') || ' ' || COALESCE("summary", ''))
  );

-- Foreign-key indexes keep joins and parent-row integrity checks predictable as
-- operational history grows.
CREATE INDEX "agent_assignment_logs_previousAgentId_idx" ON "agent_assignment_logs"("previousAgentId");
CREATE INDEX "agent_assignment_logs_newAgentId_idx" ON "agent_assignment_logs"("newAgentId");
CREATE INDEX "agent_assignment_logs_changedById_idx" ON "agent_assignment_logs"("changedById");
CREATE INDEX "contributions_overriddenById_idx" ON "contributions"("overriddenById");
CREATE INDEX "daily_reconciliations_reviewedById_idx" ON "daily_reconciliations"("reviewedById");
CREATE INDEX "payouts_approvedById_idx" ON "payouts"("approvedById");
CREATE INDEX "contribution_correction_requests_customerProfileId_idx" ON "contribution_correction_requests"("customerProfileId");
CREATE INDEX "contribution_correction_requests_reviewedById_idx" ON "contribution_correction_requests"("reviewedById");
CREATE INDEX "missing_payment_reports_contributionPlanId_idx" ON "missing_payment_reports"("contributionPlanId");
CREATE INDEX "missing_payment_reports_reviewedById_idx" ON "missing_payment_reports"("reviewedById");

-- Company-wide financial totals are maintained incrementally so dashboard
-- reads remain constant-time even when contribution history becomes large.
CREATE TABLE "business_financial_summaries" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "lifetimeCollections" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "grossSavingsClosed" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "paidOutToCustomers" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "commissionEarned" DECIMAL(18,2) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "business_financial_summaries_pkey" PRIMARY KEY ("id")
);

INSERT INTO "business_financial_summaries" (
  "id",
  "lifetimeCollections",
  "grossSavingsClosed",
  "paidOutToCustomers",
  "commissionEarned"
)
SELECT
  'default',
  COALESCE((SELECT SUM(c."amount") FROM "contributions" c WHERE c."status" = 'COLLECTED'), 0),
  COALESCE((SELECT SUM(p."grossSavings") FROM "payouts" p), 0),
  COALESCE((SELECT SUM(p."customerAmount") FROM "payouts" p), 0),
  COALESCE((SELECT SUM(p."commissionAmount") FROM "payouts" p), 0);

CREATE FUNCTION update_contribution_financial_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  old_collected DECIMAL(18,2) := 0;
  new_collected DECIMAL(18,2) := 0;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."status" = 'COLLECTED' THEN
    old_collected := COALESCE(OLD."amount", 0);
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."status" = 'COLLECTED' THEN
    new_collected := COALESCE(NEW."amount", 0);
  END IF;

  UPDATE "business_financial_summaries"
  SET "lifetimeCollections" = "lifetimeCollections" + new_collected - old_collected,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = 'default';
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "contributions_financial_summary_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "contributions"
FOR EACH ROW EXECUTE FUNCTION update_contribution_financial_summary();

CREATE FUNCTION update_payout_financial_summary()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  old_gross DECIMAL(18,2) := 0;
  old_customer DECIMAL(18,2) := 0;
  old_commission DECIMAL(18,2) := 0;
  new_gross DECIMAL(18,2) := 0;
  new_customer DECIMAL(18,2) := 0;
  new_commission DECIMAL(18,2) := 0;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    old_gross := COALESCE(OLD."grossSavings", 0);
    old_customer := COALESCE(OLD."customerAmount", 0);
    old_commission := COALESCE(OLD."commissionAmount", 0);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    new_gross := COALESCE(NEW."grossSavings", 0);
    new_customer := COALESCE(NEW."customerAmount", 0);
    new_commission := COALESCE(NEW."commissionAmount", 0);
  END IF;

  UPDATE "business_financial_summaries"
  SET "grossSavingsClosed" = "grossSavingsClosed" + new_gross - old_gross,
      "paidOutToCustomers" = "paidOutToCustomers" + new_customer - old_customer,
      "commissionEarned" = "commissionEarned" + new_commission - old_commission,
      "updatedAt" = CURRENT_TIMESTAMP
  WHERE "id" = 'default';
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "payouts_financial_summary_trigger"
AFTER INSERT OR UPDATE OR DELETE ON "payouts"
FOR EACH ROW EXECUTE FUNCTION update_payout_financial_summary();
