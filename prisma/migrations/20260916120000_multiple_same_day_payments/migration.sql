-- Keep all existing financial rows and receipts. A payment may now be made
-- more than once per plan and calendar day; the plain lookup index remains.
DROP INDEX IF EXISTS "contributions_plan_date_non_override_key";

-- Idempotency protects a confirmed second payment from network retries or
-- double submissions. Old contributions have NULL here and remain untouched.
ALTER TABLE "contributions" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "contributions_clientRequestId_key"
  ON "contributions"("clientRequestId");
