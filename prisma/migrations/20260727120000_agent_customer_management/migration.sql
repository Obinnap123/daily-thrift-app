-- Dedicated sequence for generating unique, sequential Customer Codes
-- (e.g. "DDT-000123"). A real Postgres sequence guarantees no two
-- concurrent registrations can ever be handed the same number, which a
-- "SELECT MAX(...)+1" approach in application code cannot guarantee under
-- concurrent writes.
CREATE SEQUENCE IF NOT EXISTS "customer_code_seq" START WITH 1 INCREMENT BY 1;

-- AlterTable: add as NULLable first so this applies cleanly even if rows
-- already exist (they do, from earlier manual testing), then backfill,
-- then enforce NOT NULL.
ALTER TABLE "customer_profiles" ADD COLUMN     "customerCode" TEXT,
ADD COLUMN     "passportPhotoUrl" TEXT;

-- Backfill any pre-existing rows with a generated code from the same
-- sequence used going forward, so every row ends up with a valid,
-- collision-free code before we enforce NOT NULL below.
UPDATE "customer_profiles"
SET "customerCode" = 'DDT-' || LPAD(nextval('customer_code_seq')::text, 6, '0')
WHERE "customerCode" IS NULL;

ALTER TABLE "customer_profiles" ALTER COLUMN "customerCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_customerCode_key" ON "customer_profiles"("customerCode");
