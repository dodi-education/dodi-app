-- Tighten the publication handle to 3-15 characters (was 3-30). Keeps the DB in
-- step with PUBLICATION_HANDLE_RE in @dodi/protocol/publication-handle, which is
-- the rule the submit form and the API route both validate against.

-- forward:

ALTER TABLE "public"."accounts"
  DROP CONSTRAINT IF EXISTS "accounts_publication_handle_format_check";

ALTER TABLE "public"."accounts"
  ADD CONSTRAINT "accounts_publication_handle_format_check"
    CHECK (("publication_handle" IS NULL) OR ("publication_handle" ~ '^[a-z0-9_]{3,15}$'));

COMMENT ON COLUMN "public"."accounts"."publication_handle" IS 'Deliberately PUBLIC author byline for dodi Discover (like kids.social_id). Lowercase [a-z0-9_], 3-15 chars, unique. NULL until the first publish.';

-- reverse:
-- ALTER TABLE "public"."accounts" DROP CONSTRAINT IF EXISTS "accounts_publication_handle_format_check";
-- ALTER TABLE "public"."accounts" ADD CONSTRAINT "accounts_publication_handle_format_check" CHECK (("publication_handle" IS NULL) OR ("publication_handle" ~ '^[a-z0-9_]{3,30}$'));
