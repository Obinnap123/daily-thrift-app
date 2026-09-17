-- Repeated submissions of the same manual payout must return one receipt,
-- not subtract the customer's savings twice.
ALTER TABLE "payouts" ADD COLUMN "clientRequestId" TEXT;
CREATE UNIQUE INDEX "payouts_clientRequestId_key" ON "payouts"("clientRequestId");
