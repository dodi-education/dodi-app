-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with snapshot autosave support and the shared-snapshot game_id fix:
--   1. origin gains the 'autosave' value (one hidden resume slot per kid+game,
--      overwritten in place by the autosave service).
--   2. received rows now carry the sender's game_id (soft reference), so the
--      sender-check constraint keys on origin='received' instead of ='own'.
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.

ALTER TABLE "public"."game_snapshots"
  DROP CONSTRAINT IF EXISTS "game_snapshots_origin_check";
ALTER TABLE "public"."game_snapshots"
  ADD CONSTRAINT "game_snapshots_origin_check"
  CHECK (("origin" = ANY (ARRAY['own'::text, 'received'::text, 'autosave'::text])));

ALTER TABLE "public"."game_snapshots"
  DROP CONSTRAINT IF EXISTS "game_snapshots_received_sender_check";
ALTER TABLE "public"."game_snapshots"
  ADD CONSTRAINT "game_snapshots_received_sender_check"
  CHECK ((("origin" <> 'received'::text) OR ("sender_kid_id" IS NOT NULL)));

-- One autosave slot per kid and game; the service overwrites it in place.
CREATE UNIQUE INDEX IF NOT EXISTS "game_snapshots_autosave_unique_idx"
  ON "public"."game_snapshots" USING btree ("kid_id", "game_id")
  WHERE ("origin" = 'autosave'::text);

DROP POLICY IF EXISTS "Users can create own game snapshots" ON "public"."game_snapshots";
CREATE POLICY "Users can create own game snapshots" ON "public"."game_snapshots"
  FOR INSERT WITH CHECK (((auth.uid() = "account_id") AND ("origin" = ANY (ARRAY['own'::text, 'autosave'::text]))));

COMMENT ON COLUMN "public"."game_snapshots"."game_id" IS 'Soft reference to the source game (the sender''s game for received snapshots); NULL only after game deletion.';
COMMENT ON COLUMN "public"."game_snapshots"."origin" IS 'own = manually saved by this kid; received = delivered by a friend; autosave = the kid''s single resume slot per game (hidden from the collection, overwritten in place).';
