-- Publication request drafts. The publish flow's translate step now creates
-- the request row BEFORE submission, so the parent's paid listing translations
-- survive leaving the dialog (the review-in-studio round trip). Lifecycle:
--
--   draft     created_at set, submitted_at NULL. listing_translations_enc
--             holds the per-locale title/description SEALED client-side
--             (enc:v1: under the account vault key) — the source game is still
--             E2EE-private at this point, so the server must never hold these
--             texts in plaintext before the parent actually submits.
--   submitted submitted_at stamped, publication_game_id set, the sealed blob
--             cleared (the plaintext game_translations rows on the copy
--             supersede it).
--
-- The monthly quota counts submitted_at (drafts are free; a NULL never passes
-- the >= month-start filter), and the hard-block check keys on rejection_kind,
-- which only ever appears on submitted rows.

-- forward:
ALTER TABLE "public"."game_publication_requests"
  RENAME COLUMN "requested_at" TO "submitted_at";
ALTER TABLE "public"."game_publication_requests"
  ALTER COLUMN "submitted_at" DROP DEFAULT,
  ALTER COLUMN "submitted_at" DROP NOT NULL;

ALTER TABLE "public"."game_publication_requests"
  ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
  ADD COLUMN IF NOT EXISTS "listing_translations_enc" "text";

-- Every pre-draft row was created at submit time.
UPDATE "public"."game_publication_requests"
  SET "created_at" = "submitted_at"
  WHERE "submitted_at" IS NOT NULL;

COMMENT ON COLUMN "public"."game_publication_requests"."submitted_at" IS
  'When the parent submitted for review; NULL = draft (translations prepared, not yet submitted).';
COMMENT ON COLUMN "public"."game_publication_requests"."listing_translations_enc" IS
  'Draft-only: per-locale listing title/description, sealed client-side (enc:v1:); cleared at submit.';

-- At most one draft per source game — the translate step upserts it.
CREATE UNIQUE INDEX IF NOT EXISTS "game_publication_requests_draft_uniq"
  ON "public"."game_publication_requests" USING "btree" ("source_game_id")
  WHERE ("submitted_at" IS NULL);

-- reverse:
-- DROP INDEX IF EXISTS "public"."game_publication_requests_draft_uniq";
-- DELETE FROM "public"."game_publication_requests" WHERE "submitted_at" IS NULL;
-- ALTER TABLE "public"."game_publication_requests"
--   DROP COLUMN IF EXISTS "listing_translations_enc",
--   DROP COLUMN IF EXISTS "created_at";
-- ALTER TABLE "public"."game_publication_requests"
--   ALTER COLUMN "submitted_at" SET DEFAULT "now"(),
--   ALTER COLUMN "submitted_at" SET NOT NULL;
-- ALTER TABLE "public"."game_publication_requests"
--   RENAME COLUMN "submitted_at" TO "requested_at";
