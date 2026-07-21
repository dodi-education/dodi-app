-- E2EE for parent-created games + the publication (dodi Discover) state machine.
--
-- Invariant introduced here:
--   a `games` row is PLAINTEXT iff  is_system = true  OR  publication_requested_at IS NOT NULL.
--   Everything else carries `enc:v1:` records sealed client-side under the account VMK.
--
-- Publication forks: requesting publication inserts a SECOND, plaintext games row
-- (source_game_id -> the private original). The parent's own row and its whole
-- game_versions history stay end-to-end encrypted forever.

-- forward:

ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "publication_requested_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "published_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "approved_by" "text",
  ADD COLUMN IF NOT EXISTS "published_by_account_id" "uuid";

DO $$ BEGIN
  ALTER TABLE "public"."games"
    ADD CONSTRAINT "games_published_by_account_id_fkey" FOREIGN KEY ("published_by_account_id")
      REFERENCES "public"."accounts"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."games"
    ADD CONSTRAINT "games_approved_by_check"
      CHECK (("approved_by" IS NULL) OR ("approved_by" = ANY (ARRAY['system'::"text", 'admin'::"text"])));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."games"
    ADD CONSTRAINT "games_published_requires_review_check"
      CHECK (("published_at" IS NULL)
             OR (("publication_requested_at" IS NOT NULL) AND ("approved_by" IS NOT NULL)));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One live submission per source game. Remix rows carry source_game_id but no
-- publication_requested_at, so the partial predicate excludes them.
CREATE UNIQUE INDEX IF NOT EXISTS "games_publication_source_uniq"
  ON "public"."games" USING "btree" ("source_game_id")
  WHERE ("publication_requested_at" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "games_published_idx"
  ON "public"."games" USING "btree" ("published_at" DESC)
  WHERE ("published_at" IS NOT NULL);

CREATE INDEX IF NOT EXISTS "games_review_queue_idx"
  ON "public"."games" USING "btree" ("publication_requested_at")
  WHERE ("publication_requested_at" IS NOT NULL AND "published_at" IS NULL);

-- Deliberately PUBLIC author byline, like kids.social_id: plaintext because it
-- is chosen for publication, while every real name stays E2EE. Lowercase
-- canonical; NULL until the account's first publish.
ALTER TABLE "public"."accounts"
  ADD COLUMN IF NOT EXISTS "publication_handle" "text";

DO $$ BEGIN
  ALTER TABLE "public"."accounts"
    ADD CONSTRAINT "accounts_publication_handle_key" UNIQUE ("publication_handle");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."accounts"
    ADD CONSTRAINT "accounts_publication_handle_format_check"
      CHECK (("publication_handle" IS NULL) OR ("publication_handle" ~ '^[a-z0-9_]{3,30}$'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lets the parent activity feed name a game without ever writing a decrypted
-- title into the plaintext activities.message column.
ALTER TABLE "public"."activities"
  ADD COLUMN IF NOT EXISTS "game_id" "uuid";

DO $$ BEGIN
  ALTER TABLE "public"."activities"
    ADD CONSTRAINT "activities_game_id_fkey" FOREIGN KEY ("game_id")
      REFERENCES "public"."games"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Publication rows are written ONLY by the platform through the service role
-- (same gate as api/snapshots/share). Excluding them from the user-facing write
-- policies stops a parent editing a submitted game out from under review via
-- PostgREST. SELECT and DELETE stay as they are so the parent can still read and
-- withdraw their own submission.
DROP POLICY IF EXISTS "Users can create own custom games" ON "public"."games";
CREATE POLICY "Users can create own custom games" ON "public"."games"
  FOR INSERT WITH CHECK ((("auth"."uid"() = "account_id")
                          AND ("is_system" = false)
                          AND ("publication_requested_at" IS NULL)));

DROP POLICY IF EXISTS "Users can update own custom games" ON "public"."games";
CREATE POLICY "Users can update own custom games" ON "public"."games"
  FOR UPDATE USING ((("auth"."uid"() = "account_id")
                     AND ("is_system" = false)
                     AND ("publication_requested_at" IS NULL)))
         WITH CHECK ((("auth"."uid"() = "account_id")
                      AND ("is_system" = false)
                      AND ("publication_requested_at" IS NULL)));

COMMENT ON COLUMN "public"."games"."title" IS 'E2EE enc:v1: under the account VMK for private games; plaintext for system games and publication copies. Server cannot decrypt.';
COMMENT ON COLUMN "public"."games"."description" IS 'E2EE enc:v1: under the account VMK for private games; plaintext for system games and publication copies. Server cannot decrypt.';
COMMENT ON COLUMN "public"."games"."code_bundle" IS 'E2EE enc:v1: under the account VMK for private games; plaintext for system games and publication copies. Server cannot decrypt.';
COMMENT ON COLUMN "public"."games"."markdown" IS 'E2EE enc:v1: under the account VMK for private games; plaintext for system games and publication copies. Server cannot decrypt.';
COMMENT ON COLUMN "public"."games"."learning_goal" IS 'E2EE enc:v1: under the account VMK for private games; plaintext for system games and publication copies. Server cannot decrypt.';
COMMENT ON COLUMN "public"."games"."success_definition" IS 'E2EE enc:v1: under the account VMK for private games; plaintext for system games and publication copies. Server cannot decrypt.';
COMMENT ON COLUMN "public"."games"."success_criteria" IS 'jsonb holding an enc:v1: STRING scalar for private games (sealed SuccessCriteria JSON); a plain object for system games and publication copies. Server cannot decrypt.';
COMMENT ON COLUMN "public"."games"."preview_image" IS 'E2EE enc:v1: under the account VMK for private games; plaintext path/data URL for system games and publication copies. Server cannot decrypt.';
COMMENT ON COLUMN "public"."game_versions"."code_bundle" IS 'E2EE enc:v1: — copied verbatim from games.code_bundle, so version history inherits the game''s encryption state.';
COMMENT ON COLUMN "public"."games"."publication_requested_at" IS 'Set on a publication COPY when the parent submits it for review. Non-NULL also means: this row is plaintext.';
COMMENT ON COLUMN "public"."games"."published_at" IS 'Stamped by the review pass once the submission is approved.';
COMMENT ON COLUMN "public"."games"."approved_by" IS 'Who approved the publication: system (automated review agent) or admin (manual).';
COMMENT ON COLUMN "public"."games"."published_by_account_id" IS 'Authorship, as opposed to account_id which is ownership (CASCADE). Kept separate so an approved listing can later be re-parented to a dodi-owned catalog row without losing credit.';
COMMENT ON COLUMN "public"."accounts"."publication_handle" IS 'Deliberately PUBLIC author byline for dodi Discover (like kids.social_id). Lowercase [a-z0-9_], 3-30 chars, unique. NULL until the first publish.';
COMMENT ON COLUMN "public"."activities"."game_id" IS 'Soft reference so the activity feed can name a game client-side; the title itself is E2EE and must never be written into message.';

-- reverse:
-- DROP POLICY IF EXISTS "Users can update own custom games" ON "public"."games";
-- CREATE POLICY "Users can update own custom games" ON "public"."games" FOR UPDATE USING ((("auth"."uid"() = "account_id") AND ("is_system" = false))) WITH CHECK ((("auth"."uid"() = "account_id") AND ("is_system" = false)));
-- DROP POLICY IF EXISTS "Users can create own custom games" ON "public"."games";
-- CREATE POLICY "Users can create own custom games" ON "public"."games" FOR INSERT WITH CHECK ((("auth"."uid"() = "account_id") AND ("is_system" = false)));
-- ALTER TABLE "public"."activities" DROP COLUMN IF EXISTS "game_id";
-- ALTER TABLE "public"."accounts" DROP COLUMN IF EXISTS "publication_handle";
-- DROP INDEX IF EXISTS "games_review_queue_idx";
-- DROP INDEX IF EXISTS "games_published_idx";
-- DROP INDEX IF EXISTS "games_publication_source_uniq";
-- ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "published_by_account_id";
-- ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "approved_by";
-- ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "published_at";
-- ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "publication_requested_at";
