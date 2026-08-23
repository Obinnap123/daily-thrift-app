-- Allow the business to publish different call and WhatsApp support numbers.
-- A NULL WhatsApp number intentionally falls back to supportPhone in the app,
-- preserving existing installations without rewriting their settings.

ALTER TABLE "business_settings"
  ADD COLUMN "supportWhatsApp" TEXT;
