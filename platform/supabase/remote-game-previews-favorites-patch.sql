-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the kid game-library rework (what local baseline.sql + seed.sql now define,
-- but a db reset / db seed will NOT re-apply to the linked remote).
--
--   1) games.preview_image (text, nullable): optional 100x100 preview for the kid
--      library. System games point at a static SVG; NULL ⇒ generic icon.
--   2) game_favorites: per-kid favorite games (heart toggle), modeled on
--      game_sharings — RLS on account_id, kid_id scopes to the profile.
--   3) System games: canonical tags set to the reworked catalog
--      ({drawing,ai-image} — the drawing games generate AI images) and
--      preview_image pointed at the served SVGs.
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.
-- Requires the drawing-basic / mandala-basic system games to already exist.

BEGIN;

-- 1) Preview image column ------------------------------------------------------
ALTER TABLE "public"."games" ADD COLUMN IF NOT EXISTS "preview_image" "text";

-- 2) Per-kid favorites table ---------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."game_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kid_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_favorites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_favorites_kid_game_uniq" UNIQUE ("kid_id", "game_id")
);

ALTER TABLE "public"."game_favorites" OWNER TO "postgres";

DO $$ BEGIN
  ALTER TABLE ONLY "public"."game_favorites"
    ADD CONSTRAINT "game_favorites_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY "public"."game_favorites"
    ADD CONSTRAINT "game_favorites_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE ONLY "public"."game_favorites"
    ADD CONSTRAINT "game_favorites_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "game_favorites_kid_idx" ON "public"."game_favorites" USING "btree" ("kid_id");

ALTER TABLE "public"."game_favorites" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own game favorites" ON "public"."game_favorites";
CREATE POLICY "Users can create own game favorites" ON "public"."game_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));

DROP POLICY IF EXISTS "Users can delete own game favorites" ON "public"."game_favorites";
CREATE POLICY "Users can delete own game favorites" ON "public"."game_favorites" FOR DELETE USING (("auth"."uid"() = "account_id"));

DROP POLICY IF EXISTS "Users can view own game favorites" ON "public"."game_favorites";
CREATE POLICY "Users can view own game favorites" ON "public"."game_favorites" FOR SELECT USING (("auth"."uid"() = "account_id"));

GRANT ALL ON TABLE "public"."game_favorites" TO "anon";
GRANT ALL ON TABLE "public"."game_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."game_favorites" TO "service_role";

-- 3) System games: catalog-only tags + preview images --------------------------
UPDATE public.games
   SET tags = '{drawing,ai-image}', preview_image = '/images/game-previews/drawing.svg'
 WHERE system_key = 'drawing-basic';

UPDATE public.games
   SET tags = '{drawing,ai-image}', preview_image = '/images/game-previews/mandala.svg'
 WHERE system_key = 'mandala-basic';

COMMIT;
