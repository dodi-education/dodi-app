-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the progress & success system (the new columns/table that the local
-- baseline.sql adds but a `db reset` won't re-apply to remote).
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.

-- 1) games: progress & success columns ------------------------------------
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "learning_goal" text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS "success_definition" text NOT NULL DEFAULT ''::text,
  ADD COLUMN IF NOT EXISTS "success_criteria" jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "progress_kind" text NOT NULL DEFAULT 'open'::text;

DO $$ BEGIN
  ALTER TABLE "public"."games"
    ADD CONSTRAINT "games_progress_kind_check"
    CHECK (("progress_kind" = ANY (ARRAY['goal'::text, 'open'::text])));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) game_plays: gameplay results (challenge substrate) --------------------
CREATE TABLE IF NOT EXISTS "public"."game_plays" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "account_id" uuid NOT NULL,
    "profile_id" uuid NOT NULL,
    "game_id" uuid NOT NULL,
    "progress_kind" text DEFAULT 'open'::text NOT NULL,
    "started_at" timestamptz DEFAULT now() NOT NULL,
    "ended_at" timestamptz,
    "succeeded" boolean DEFAULT false NOT NULL,
    "succeeded_at" timestamptz,
    "final_progress" numeric DEFAULT 0 NOT NULL,
    "metrics" jsonb DEFAULT '{}'::jsonb NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "game_plays_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_plays_progress_kind_check" CHECK (("progress_kind" = ANY (ARRAY['goal'::text, 'open'::text]))),
    CONSTRAINT "game_plays_progress_range_check" CHECK ((("final_progress" >= (0)::numeric) AND ("final_progress" <= (1)::numeric))),
    CONSTRAINT "game_plays_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE,
    CONSTRAINT "game_plays_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE,
    CONSTRAINT "game_plays_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "game_plays_account_created_idx" ON "public"."game_plays" USING btree ("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "game_plays_challenge_idx" ON "public"."game_plays" USING btree ("profile_id", "succeeded", "started_at" DESC);
CREATE INDEX IF NOT EXISTS "game_plays_game_idx" ON "public"."game_plays" USING btree ("game_id", "created_at" DESC);

CREATE OR REPLACE TRIGGER "game_plays_updated_at" BEFORE UPDATE ON "public"."game_plays"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."game_plays" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own game plays" ON "public"."game_plays";
CREATE POLICY "Users can create own game plays" ON "public"."game_plays"
  FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));

DROP POLICY IF EXISTS "Users can update own game plays" ON "public"."game_plays";
CREATE POLICY "Users can update own game plays" ON "public"."game_plays"
  FOR UPDATE USING (("auth"."uid"() = "account_id")) WITH CHECK (("auth"."uid"() = "account_id"));

DROP POLICY IF EXISTS "Users can view own game plays" ON "public"."game_plays";
CREATE POLICY "Users can view own game plays" ON "public"."game_plays"
  FOR SELECT USING (("auth"."uid"() = "account_id"));

GRANT ALL ON TABLE "public"."game_plays" TO "anon";
GRANT ALL ON TABLE "public"."game_plays" TO "authenticated";
GRANT ALL ON TABLE "public"."game_plays" TO "service_role";
