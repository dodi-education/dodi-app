-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the sender-side "sent" marker on game snapshots: own rows created by
-- sharing now record the friend kid the copy was delivered to
-- (shared_with_kid_id), so the parent Snapshots view can offer a "Sent"
-- usage filter without peeking into other accounts' received rows.
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.

ALTER TABLE "public"."game_snapshots"
  ADD COLUMN IF NOT EXISTS "shared_with_kid_id" "uuid";

ALTER TABLE "public"."game_snapshots"
  DROP CONSTRAINT IF EXISTS "game_snapshots_shared_with_kid_id_fkey";
ALTER TABLE "public"."game_snapshots"
  ADD CONSTRAINT "game_snapshots_shared_with_kid_id_fkey"
  FOREIGN KEY ("shared_with_kid_id") REFERENCES "public"."kids"("id") ON DELETE SET NULL;

COMMENT ON COLUMN "public"."game_snapshots"."shared_with_kid_id" IS 'Sender-side "sent" marker on own rows: the friend kid this snapshot was delivered to when it was created by sharing (share implies save). NULL for plain saves; set NULL if the friend kid is deleted.';
