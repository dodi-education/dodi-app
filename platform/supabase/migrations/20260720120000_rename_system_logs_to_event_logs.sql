-- Rename "system_logs" table and related objects to "event_logs".
-- This accompanies the UI rename of "System logs" → "Event logs" in the parent view.
-- Run automatically on `supabase db reset` and on deploy.

-- forward:
ALTER TABLE "public"."system_logs" RENAME TO "event_logs";

ALTER TABLE "public"."event_logs" RENAME CONSTRAINT "system_logs_pkey" TO "event_logs_pkey";

ALTER INDEX "system_logs_account_id_idx" RENAME TO "event_logs_account_id_idx";
ALTER INDEX "system_logs_created_at_idx" RENAME TO "event_logs_created_at_idx";
ALTER INDEX "system_logs_kid_id_idx" RENAME TO "event_logs_kid_id_idx";

ALTER TABLE "public"."event_logs" RENAME CONSTRAINT "system_logs_account_id_fkey" TO "event_logs_account_id_fkey";
ALTER TABLE "public"."event_logs" RENAME CONSTRAINT "system_logs_persona_id_fkey" TO "event_logs_persona_id_fkey";
ALTER TABLE "public"."event_logs" RENAME CONSTRAINT "system_logs_kid_id_fkey" TO "event_logs_kid_id_fkey";

ALTER POLICY "Users can insert own logs" ON "public"."event_logs" RENAME TO "Users can insert own event logs";
ALTER POLICY "Users can view own logs" ON "public"."event_logs" RENAME TO "Users can view own event logs";

-- Note: RLS enable and GRANTs travel with the table rename; no re-statement needed.

-- reverse:
-- ALTER POLICY "Users can view own event logs" ON "public"."event_logs" RENAME TO "Users can view own logs";
-- ALTER POLICY "Users can insert own event logs" ON "public"."event_logs" RENAME TO "Users can insert own logs";
-- ALTER TABLE "public"."event_logs" RENAME CONSTRAINT "event_logs_kid_id_fkey" TO "system_logs_kid_id_fkey";
-- ALTER TABLE "public"."event_logs" RENAME CONSTRAINT "event_logs_persona_id_fkey" TO "system_logs_persona_id_fkey";
-- ALTER TABLE "public"."event_logs" RENAME CONSTRAINT "event_logs_account_id_fkey" TO "system_logs_account_id_fkey";
-- ALTER INDEX "event_logs_kid_id_idx" RENAME TO "system_logs_kid_id_idx";
-- ALTER INDEX "event_logs_created_at_idx" RENAME TO "system_logs_created_at_idx";
-- ALTER INDEX "event_logs_account_id_idx" RENAME TO "system_logs_account_id_idx";
-- ALTER TABLE "public"."event_logs" RENAME CONSTRAINT "event_logs_pkey" TO "system_logs_pkey";
-- ALTER TABLE "public"."event_logs" RENAME TO "system_logs";
