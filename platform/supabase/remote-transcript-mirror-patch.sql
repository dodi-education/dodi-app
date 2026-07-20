-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the transcript-mirror rework: transcripts.content_enc (E2EE day mirror),
-- two-value status enum (open|processed), and removal of
-- transcript_entries.sort_index (entries order by occurred_at; the mirror
-- preserves conversational order for the memory pipeline).
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.
--
-- If the memory tables (transcripts, transcript_entries, memories,
-- memory_sources) do not exist on the remote yet, run the full migration
-- migrations/20260720140200_memory_transcripts_and_sources.sql instead of
-- this patch.

ALTER TABLE "public"."transcripts"
  ADD COLUMN IF NOT EXISTS "content_enc" "text";

UPDATE "public"."transcripts"
  SET "status" = 'open'
  WHERE "status" = 'pending_process';

ALTER TABLE "public"."transcripts"
  DROP CONSTRAINT IF EXISTS "transcripts_status_check";
ALTER TABLE "public"."transcripts"
  ADD CONSTRAINT "transcripts_status_check" CHECK (
    ("status" = ANY (ARRAY['open'::"text", 'processed'::"text"]))
  );

ALTER TABLE "public"."transcript_entries"
  DROP CONSTRAINT IF EXISTS "transcript_entries_transcript_sort_key";
ALTER TABLE "public"."transcript_entries"
  DROP COLUMN IF EXISTS "sort_index";

DROP INDEX IF EXISTS "public"."transcript_entries_transcript_id_idx";
CREATE INDEX IF NOT EXISTS "transcript_entries_transcript_id_idx"
  ON "public"."transcript_entries" USING "btree" ("transcript_id", "occurred_at");

COMMENT ON COLUMN "public"."transcripts"."content_enc" IS 'E2EE JSON mirror of all day entries (ids + text); one-decrypt read path for memory processing.';
COMMENT ON TABLE "public"."transcript_entries" IS 'Encrypted turn content (role dodi|kid), ordered by occurred_at. Cited by memory_sources.';
