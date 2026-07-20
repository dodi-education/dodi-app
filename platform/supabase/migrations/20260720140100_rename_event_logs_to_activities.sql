-- Rename "event_logs" → "activities" (kid activity timeline under parent Insights).
-- Memory create/discard is NOT stored here — see memories / memory_sources.

-- forward:
ALTER TABLE "public"."event_logs" RENAME TO "activities";

ALTER TABLE "public"."activities" RENAME CONSTRAINT "event_logs_pkey" TO "activities_pkey";
ALTER TABLE "public"."activities" RENAME CONSTRAINT "event_logs_account_id_fkey" TO "activities_account_id_fkey";
ALTER TABLE "public"."activities" RENAME CONSTRAINT "event_logs_persona_id_fkey" TO "activities_persona_id_fkey";
ALTER TABLE "public"."activities" RENAME CONSTRAINT "event_logs_kid_id_fkey" TO "activities_kid_id_fkey";

ALTER INDEX "event_logs_account_id_idx" RENAME TO "activities_account_id_idx";
ALTER INDEX "event_logs_created_at_idx" RENAME TO "activities_created_at_idx";
ALTER INDEX "event_logs_kid_id_idx" RENAME TO "activities_kid_id_idx";

ALTER POLICY "Users can insert own event logs" ON "public"."activities"
  RENAME TO "Users can insert own activities";
ALTER POLICY "Users can view own event logs" ON "public"."activities"
  RENAME TO "Users can view own activities";

-- reverse:
-- ALTER POLICY "Users can view own activities" ON "public"."activities" RENAME TO "Users can view own event logs";
-- ALTER POLICY "Users can insert own activities" ON "public"."activities" RENAME TO "Users can insert own event logs";
-- ALTER INDEX "activities_kid_id_idx" RENAME TO "event_logs_kid_id_idx";
-- ALTER INDEX "activities_created_at_idx" RENAME TO "event_logs_created_at_idx";
-- ALTER INDEX "activities_account_id_idx" RENAME TO "event_logs_account_id_idx";
-- ALTER TABLE "public"."activities" RENAME CONSTRAINT "activities_kid_id_fkey" TO "event_logs_kid_id_fkey";
-- ALTER TABLE "public"."activities" RENAME CONSTRAINT "activities_persona_id_fkey" TO "event_logs_persona_id_fkey";
-- ALTER TABLE "public"."activities" RENAME CONSTRAINT "activities_account_id_fkey" TO "event_logs_account_id_fkey";
-- ALTER TABLE "public"."activities" RENAME CONSTRAINT "activities_pkey" TO "event_logs_pkey";
-- ALTER TABLE "public"."activities" RENAME TO "event_logs";
