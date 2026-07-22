-- Publication review harness + Discover sharing.
--
-- Adds what turns the publication state machine into a working feature:
--   * rejection state (hard|soft + reasons) on the publication copy row,
--   * a per-account monthly submission quota (every submit = one paid AI review),
--   * game_publication_requests — the quota/audit/hard-block log that OUTLIVES
--     the copy row (withdraw deletes the copy; a hard rejection must not be
--     erasable that way),
--   * review bookkeeping (attempt counter doubling as an optimistic claim token
--     for the cron worker),
--   * a sharing-uniqueness fix so ANY family can family-share a published game
--     (Discover is play-in-place via game_sharings, never a copy).
--
-- The security agent itself is configured via three platform_config rows
-- (service-role only, no seeds — absence means the harness is disabled):
--
--   INSERT INTO "public"."platform_config" ("key", "value") VALUES
--     ('security_agent_provider', '"anthropic"'),
--     ('security_agent_model',    '"claude-sonnet-4-6"'),
--     ('security_agent_key',      '"sk-ant-..."')
--   ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = now();

-- forward:

-- Account entitlement + moderation flag. The limit follows the plan-entitlement
-- pattern (copied caps live on the account so they can be overridden per
-- account); flagged_for_review_at is stamped once on the first hard rejection.
ALTER TABLE "public"."accounts"
  ADD COLUMN IF NOT EXISTS "monthly_game_publication_limit" integer DEFAULT 3 NOT NULL,
  ADD COLUMN IF NOT EXISTS "flagged_for_review_at" timestamp with time zone;

-- Rejection state on the publication copy. rejection_kind mirrors PROJECT.md's
-- "rejection type": hard = permanent (source can never be resubmitted), soft =
-- demand changes (parent fixes and resubmits).
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "rejected_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "rejection_kind" "text",
  ADD COLUMN IF NOT EXISTS "rejection_reasons" "jsonb",
  ADD COLUMN IF NOT EXISTS "review_attempts" integer DEFAULT 0 NOT NULL;

DO $$ BEGIN
  ALTER TABLE "public"."games"
    ADD CONSTRAINT "games_rejection_kind_check"
      CHECK (("rejection_kind" IS NULL) OR ("rejection_kind" = ANY (ARRAY['hard'::"text", 'soft'::"text"])));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."games"
    ADD CONSTRAINT "games_rejection_pair_check"
      CHECK (("rejected_at" IS NULL) = ("rejection_kind" IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."games"
    ADD CONSTRAINT "games_rejection_on_publication_check"
      CHECK (("rejected_at" IS NULL) OR ("publication_requested_at" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Quota / audit / hard-block log. One row per submit. account_id CASCADEs (the
-- log is meaningless without the account); the game FKs SET NULL so the row —
-- and with it the quota count and any hard-rejection stamp — survives withdraw
-- and game deletion.
CREATE TABLE IF NOT EXISTS "public"."game_publication_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "source_game_id" "uuid",
    "publication_game_id" "uuid",
    "requested_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "outcome" "text",
    "rejection_kind" "text",
    "rejection_reasons" "jsonb",
    "decided_at" timestamp with time zone,
    CONSTRAINT "game_publication_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_publication_requests_outcome_check"
      CHECK (("outcome" IS NULL) OR ("outcome" = ANY (ARRAY['approved'::"text", 'rejected'::"text"]))),
    CONSTRAINT "game_publication_requests_kind_check"
      CHECK (("rejection_kind" IS NULL) OR ("rejection_kind" = ANY (ARRAY['hard'::"text", 'soft'::"text"])))
);

DO $$ BEGIN
  ALTER TABLE "public"."game_publication_requests"
    ADD CONSTRAINT "game_publication_requests_account_id_fkey" FOREIGN KEY ("account_id")
      REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."game_publication_requests"
    ADD CONSTRAINT "game_publication_requests_source_game_id_fkey" FOREIGN KEY ("source_game_id")
      REFERENCES "public"."games"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "public"."game_publication_requests"
    ADD CONSTRAINT "game_publication_requests_publication_game_id_fkey" FOREIGN KEY ("publication_game_id")
      REFERENCES "public"."games"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "game_publication_requests_quota_idx"
  ON "public"."game_publication_requests" USING "btree" ("account_id", "requested_at" DESC);

CREATE INDEX IF NOT EXISTS "game_publication_requests_hard_block_idx"
  ON "public"."game_publication_requests" USING "btree" ("source_game_id")
  WHERE ("rejection_kind" = 'hard');

ALTER TABLE "public"."game_publication_requests" ENABLE ROW LEVEL SECURITY;

-- Parents may see their own submission history (quota transparency); every
-- write goes through the service role, so no INSERT/UPDATE/DELETE policies.
CREATE POLICY "Users can view own publication requests"
  ON "public"."game_publication_requests" FOR SELECT
  USING (("auth"."uid"() = "account_id"));

GRANT ALL ON TABLE "public"."game_publication_requests" TO "anon";
GRANT ALL ON TABLE "public"."game_publication_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."game_publication_requests" TO "service_role";

-- Discover is play-in-place: a family shares a PUBLISHED row (another account's
-- game) with its own kids via game_sharings. The old family-share uniqueness on
-- (game_id) alone meant only one account system-wide could family-share a given
-- game — scope it per account.
DROP INDEX IF EXISTS "public"."game_sharings_game_family_uniq";
CREATE UNIQUE INDEX IF NOT EXISTS "game_sharings_account_family_uniq"
  ON "public"."game_sharings" USING "btree" ("account_id", "game_id")
  WHERE ("kid_id" IS NULL);

COMMENT ON COLUMN "public"."accounts"."monthly_game_publication_limit" IS 'Max publication submissions per UTC calendar month (every submit counts — each triggers a paid AI review). Plan-entitlement pattern: per-account override allowed.';
COMMENT ON COLUMN "public"."accounts"."flagged_for_review_at" IS 'Stamped once when any of the account''s submissions is hard-rejected; surfaced to the operator, never auto-cleared.';
COMMENT ON COLUMN "public"."games"."rejected_at" IS 'Stamped by the review pass when a submission is rejected. Only ever set on publication copies; cleared on resubmit.';
COMMENT ON COLUMN "public"."games"."rejection_kind" IS 'PROJECT.md "rejection type": hard (permanent, source can never be resubmitted, account flagged) or soft (demand changes, resubmit allowed).';
COMMENT ON COLUMN "public"."games"."rejection_reasons" IS 'Array of {code, note}: code from @dodi/protocol/publication-review REJECTION_CODES, note = the agent''s plain-text explanation for the parent.';
COMMENT ON COLUMN "public"."games"."review_attempts" IS 'Security-agent attempts consumed. Doubles as the optimistic claim token for concurrent workers (UPDATE ... WHERE review_attempts = seen). Parked for the operator once it reaches the max.';
COMMENT ON TABLE "public"."game_publication_requests" IS 'One row per publication submit: monthly quota accounting, audit trail, and the durable hard-rejection block (survives withdraw/deletion via SET NULL FKs). Service-role writes only.';
COMMENT ON COLUMN "public"."game_publication_requests"."outcome" IS 'NULL while the request is undecided (pending review or withdrawn before a verdict); approved or rejected once stamped.';
COMMENT ON COLUMN "public"."game_publication_requests"."source_game_id" IS 'The parent''s private E2EE game the submission was forked from. A hard-rejected source_game_id can never be resubmitted.';

-- reverse:
-- DROP INDEX IF EXISTS "public"."game_sharings_account_family_uniq";
-- CREATE UNIQUE INDEX IF NOT EXISTS "game_sharings_game_family_uniq" ON "public"."game_sharings" USING "btree" ("game_id") WHERE ("kid_id" IS NULL);
-- DROP TABLE IF EXISTS "public"."game_publication_requests";
-- ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "review_attempts";
-- ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "rejection_reasons";
-- ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "rejection_kind";
-- ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "rejected_at";
-- ALTER TABLE "public"."accounts" DROP COLUMN IF EXISTS "flagged_for_review_at";
-- ALTER TABLE "public"."accounts" DROP COLUMN IF EXISTS "monthly_game_publication_limit";
-- DELETE FROM "public"."platform_config" WHERE "key" IN ('security_agent_provider', 'security_agent_model', 'security_agent_key');
