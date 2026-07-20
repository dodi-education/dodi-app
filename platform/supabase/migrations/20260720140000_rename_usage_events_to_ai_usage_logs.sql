-- Rename "usage_events" → "ai_usage_logs" so metering is clearly distinct from
-- kid "activities" and learning-product tables (memories, transcripts).

-- forward:
ALTER TABLE "public"."usage_events" RENAME TO "ai_usage_logs";

ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "usage_events_pkey" TO "ai_usage_logs_pkey";
ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "usage_events_event_type_check" TO "ai_usage_logs_event_type_check";
ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "usage_events_account_id_fkey" TO "ai_usage_logs_account_id_fkey";
ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "usage_events_kid_id_fkey" TO "ai_usage_logs_kid_id_fkey";
ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "usage_events_game_id_fkey" TO "ai_usage_logs_game_id_fkey";

ALTER INDEX "usage_events_account_created_idx" RENAME TO "ai_usage_logs_account_created_idx";
ALTER INDEX "usage_events_account_kid_created_idx" RENAME TO "ai_usage_logs_account_kid_created_idx";

ALTER POLICY "Users can create own usage events" ON "public"."ai_usage_logs"
  RENAME TO "Users can create own ai usage logs";
ALTER POLICY "Users can view own usage events" ON "public"."ai_usage_logs"
  RENAME TO "Users can view own ai usage logs";

-- Note: RLS enable and GRANTs travel with the table rename; no re-statement needed.

-- reverse:
-- ALTER POLICY "Users can view own ai usage logs" ON "public"."ai_usage_logs" RENAME TO "Users can view own usage events";
-- ALTER POLICY "Users can create own ai usage logs" ON "public"."ai_usage_logs" RENAME TO "Users can create own usage events";
-- ALTER INDEX "ai_usage_logs_account_kid_created_idx" RENAME TO "usage_events_account_kid_created_idx";
-- ALTER INDEX "ai_usage_logs_account_created_idx" RENAME TO "usage_events_account_created_idx";
-- ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "ai_usage_logs_game_id_fkey" TO "usage_events_game_id_fkey";
-- ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "ai_usage_logs_kid_id_fkey" TO "usage_events_kid_id_fkey";
-- ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "ai_usage_logs_account_id_fkey" TO "usage_events_account_id_fkey";
-- ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "ai_usage_logs_event_type_check" TO "usage_events_event_type_check";
-- ALTER TABLE "public"."ai_usage_logs" RENAME CONSTRAINT "ai_usage_logs_pkey" TO "usage_events_pkey";
-- ALTER TABLE "public"."ai_usage_logs" RENAME TO "usage_events";
