-- Staff email ownership verification and single-use agent invitations.

ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Existing staff accounts predate invitations and must remain usable.
UPDATE "users"
SET "emailVerifiedAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)
WHERE "role" IN ('ADMIN', 'AGENT');

CREATE TABLE "staff_email_verification_tokens" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "staff_email_verification_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "staff_email_verification_tokens_userId_key"
  ON "staff_email_verification_tokens"("userId");
CREATE UNIQUE INDEX "staff_email_verification_tokens_tokenHash_key"
  ON "staff_email_verification_tokens"("tokenHash");
CREATE INDEX "staff_email_verification_tokens_expiresAt_idx"
  ON "staff_email_verification_tokens"("expiresAt");

ALTER TABLE "staff_email_verification_tokens"
  ADD CONSTRAINT "staff_email_verification_tokens_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
