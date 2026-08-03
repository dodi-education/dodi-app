-- Game i18n: which locales a PUBLISHED game's bundle + listing fully cover.
-- Derived at publish time from the bundle's embedded translations block and
-- the game_translations rows; extended by the retroactive locale backfill when
-- the platform gains a language. Plaintext by design: only set on rows that
-- are already plaintext (publication copies), consistent with the
-- "plaintext iff is_system OR publication_requested_at" invariant. NULL on
-- private/sealed rows and on pre-i18n rows.

-- forward:
ALTER TABLE "public"."games"
  ADD COLUMN IF NOT EXISTS "available_locales" "text"[];

COMMENT ON COLUMN "public"."games"."available_locales" IS
  'Locales the published bundle + listing translations fully cover (derived at publish/backfill; NULL on private rows).';

CREATE INDEX IF NOT EXISTS "games_available_locales_idx"
  ON "public"."games" USING "gin" ("available_locales")
  WHERE ("published_at" IS NOT NULL);

-- reverse:
-- DROP INDEX IF EXISTS "public"."games_available_locales_idx";
-- ALTER TABLE "public"."games" DROP COLUMN IF EXISTS "available_locales";
