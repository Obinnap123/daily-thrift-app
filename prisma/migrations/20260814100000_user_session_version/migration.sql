-- Incremented whenever an account change must invalidate every JWT issued
-- before that change. Existing sessions have no version claim and are
-- intentionally required to sign in again after this migration is released.
ALTER TABLE "users"
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
