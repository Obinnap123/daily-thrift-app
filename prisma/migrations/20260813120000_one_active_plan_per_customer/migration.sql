-- A savings period remains ACTIVE across any number of monthly tracking
-- sheets and is closed only by payout. PostgreSQL partial uniqueness is the
-- final guard against two concurrent requests opening two periods for the
-- same customer. Prisma schema syntax cannot currently represent this index.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "contribution_plans"
    WHERE "status" = 'ACTIVE'
    GROUP BY "customerProfileId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce one active savings period: duplicate ACTIVE plans exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "contribution_plans_one_active_per_customer_key"
  ON "contribution_plans" ("customerProfileId")
  WHERE "status" = 'ACTIVE';
