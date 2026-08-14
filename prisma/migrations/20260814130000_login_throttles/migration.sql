CREATE TABLE "login_throttles" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "lastAttemptAt" TIMESTAMP(3) NOT NULL,
  "lockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "login_throttles_scope_check"
    CHECK ("scope" IN ('IDENTIFIER', 'IP')),
  CONSTRAINT "login_throttles_failed_attempts_check"
    CHECK ("failedAttempts" >= 0)
);

CREATE INDEX "login_throttles_scope_updatedAt_idx"
  ON "login_throttles" ("scope", "updatedAt");

CREATE INDEX "login_throttles_updatedAt_idx"
  ON "login_throttles" ("updatedAt");
