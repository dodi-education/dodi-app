-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the unified date/time settings (what the local baseline.sql defines but a
-- `db reset` won't re-apply to the linked remote).
--
-- 1) accounts.date_preferences: plaintext account-level date/time display prefs
--    ({ dateStyle, timeStyle, timeZoneEnc }); an explicit timezone is sealed
--    enc:v1: in timeZoneEnc so the server stays blind. Brand-new column.
-- 2) accounts.language: parent UI language (companion column; no-op if present).
-- 3) profiles.date_preferences: per-kid override. Renames the previously-unused
--    general `preferences` column if it exists; otherwise adds the column.
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.

ALTER TABLE "public"."accounts"
  ADD COLUMN IF NOT EXISTS "date_preferences" "jsonb";

COMMENT ON COLUMN "public"."accounts"."date_preferences" IS 'Plaintext account-level date/time display prefs ({ dateStyle, timeStyle, timeZoneEnc }). An explicit timezone is sealed enc:v1: in timeZoneEnc so the server stays blind.';

ALTER TABLE "public"."accounts"
  ADD COLUMN IF NOT EXISTS "language" "text" NOT NULL DEFAULT 'en';

COMMENT ON COLUMN "public"."accounts"."language" IS 'Parent UI language (BCP-47 short code, e.g. en/de). Durable source of truth; cached client-side in the NEXT_LOCALE cookie and re-seeded at login.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'preferences'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'date_preferences'
  ) THEN
    ALTER TABLE "public"."profiles" RENAME COLUMN "preferences" TO "date_preferences";
  ELSE
    ALTER TABLE "public"."profiles" ADD COLUMN IF NOT EXISTS "date_preferences" "jsonb";
  END IF;
END $$;

COMMENT ON COLUMN "public"."profiles"."date_preferences" IS 'Plaintext per-kid date/time display override ({ dateStyle?, timeStyle?, timeZoneEnc? }); absent fields inherit the account default. An explicit timezone is sealed enc:v1: in timeZoneEnc.';
