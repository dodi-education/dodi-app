-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the avatar system (what the local baseline.sql defines but a `db reset`
-- won't re-apply to remote).
--
-- 1) avatar_pin: new encrypted column for the optional avatar-PIN puzzle.
-- 2) avatar_config: convert jsonb -> text so every E2EE field is uniformly text.
--    It now holds an enc:v1: JSON string. The USING clause unwraps any existing
--    jsonb string scalar to its raw text (and leaves NULLs as NULL).
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.

ALTER TABLE "public"."profiles"
  ADD COLUMN IF NOT EXISTS "avatar_pin" "text";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'avatar_config'
      AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE "public"."profiles"
      ALTER COLUMN "avatar_config" TYPE "text"
      USING ("avatar_config" #>> '{}');
  END IF;
END $$;

COMMENT ON COLUMN "public"."profiles"."avatar_config" IS 'E2EE enc:v1: JSON string { color, avatar } — the kid''s chosen look, sealed under the account VMK. Server cannot decrypt.';
COMMENT ON COLUMN "public"."profiles"."avatar_pin" IS 'E2EE enc:v1: JSON array of 3 avatar ids — the optional avatar-PIN puzzle. NULL = disabled. Server cannot decrypt.';
