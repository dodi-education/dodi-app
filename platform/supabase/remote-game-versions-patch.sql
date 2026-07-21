-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the game-studio version-history feature (what local baseline.sql now
-- defines, but a db reset will NOT re-apply to the linked remote).
--
--   game_versions: one row per persisted code iteration of a custom game,
--   chained backwards via previous_game_version_id.
--   games.current_game_version_id: the history head (code_bundle matches).
--   games.previous_code_bundle is superseded and DROPPED — existing values are
--   migrated into the chain (previous_code_bundle → an older version row).
--
-- Safe to run multiple times. Apply via
--   pnpm db db query --linked --file platform/supabase/remote-game-versions-patch.sql

BEGIN;

CREATE TABLE IF NOT EXISTS "public"."game_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "code_bundle" "text" NOT NULL,
    "previous_game_version_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_versions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."game_versions" OWNER TO "postgres";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_versions_game_id_fkey') THEN
    ALTER TABLE ONLY "public"."game_versions"
      ADD CONSTRAINT "game_versions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_versions_account_id_fkey') THEN
    ALTER TABLE ONLY "public"."game_versions"
      ADD CONSTRAINT "game_versions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'game_versions_previous_game_version_id_fkey') THEN
    ALTER TABLE ONLY "public"."game_versions"
      ADD CONSTRAINT "game_versions_previous_game_version_id_fkey" FOREIGN KEY ("previous_game_version_id") REFERENCES "public"."game_versions"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "game_versions_game_created_idx" ON "public"."game_versions" USING btree ("game_id", "created_at" DESC);

ALTER TABLE "public"."game_versions" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own game versions" ON "public"."game_versions";
CREATE POLICY "Users can view own game versions" ON "public"."game_versions" FOR SELECT USING ((auth.uid() = "account_id"));
DROP POLICY IF EXISTS "Users can create own game versions" ON "public"."game_versions";
CREATE POLICY "Users can create own game versions" ON "public"."game_versions" FOR INSERT WITH CHECK ((auth.uid() = "account_id"));
DROP POLICY IF EXISTS "Users can update own game versions" ON "public"."game_versions";
CREATE POLICY "Users can update own game versions" ON "public"."game_versions" FOR UPDATE USING ((auth.uid() = "account_id")) WITH CHECK ((auth.uid() = "account_id"));

GRANT ALL ON TABLE "public"."game_versions" TO "anon";
GRANT ALL ON TABLE "public"."game_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."game_versions" TO "service_role";

ALTER TABLE "public"."games" ADD COLUMN IF NOT EXISTS "current_game_version_id" "uuid";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'games_current_game_version_id_fkey') THEN
    ALTER TABLE ONLY "public"."games"
      ADD CONSTRAINT "games_current_game_version_id_fkey" FOREIGN KEY ("current_game_version_id") REFERENCES "public"."game_versions"("id") ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN "public"."games"."current_game_version_id" IS
  'Head of the game_versions chain; its code_bundle matches games.code_bundle. NULL = system game or pre-versioning code.';

-- Backfill: every custom game without a version chain gets one. A surviving
-- previous_code_bundle becomes the older version (dated at game creation), the
-- live code_bundle becomes the head (dated at last update). The updated_at
-- trigger is suspended so the pointer write doesn't reshuffle the studio list.
ALTER TABLE "public"."games" DISABLE TRIGGER "games_updated_at";

DO $$
DECLARE
  g record;
  has_prev_col boolean;
  prev_code text;
  prev_id uuid;
  head_id uuid;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'games' AND column_name = 'previous_code_bundle'
  ) INTO has_prev_col;

  FOR g IN
    SELECT id, account_id, code_bundle, created_at, updated_at
    FROM public.games
    WHERE is_system = false AND current_game_version_id IS NULL
  LOOP
    prev_code := NULL;
    IF has_prev_col THEN
      EXECUTE 'SELECT previous_code_bundle FROM public.games WHERE id = $1'
        INTO prev_code USING g.id;
    END IF;

    prev_id := NULL;
    IF prev_code IS NOT NULL AND prev_code <> g.code_bundle THEN
      INSERT INTO public.game_versions (game_id, account_id, code_bundle, created_at)
      VALUES (g.id, g.account_id, prev_code, g.created_at)
      RETURNING id INTO prev_id;
    END IF;

    INSERT INTO public.game_versions (game_id, account_id, code_bundle, previous_game_version_id, created_at)
    VALUES (g.id, g.account_id, g.code_bundle, prev_id, g.updated_at)
    RETURNING id INTO head_id;

    UPDATE public.games SET current_game_version_id = head_id WHERE id = g.id;
  END LOOP;
END $$;

ALTER TABLE "public"."games" ENABLE TRIGGER "games_updated_at";

ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "previous_code_bundle";

COMMIT;
