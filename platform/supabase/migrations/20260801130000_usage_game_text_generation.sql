-- Allow the new client-side generate_text usage event (in-game AI-written
-- content: stories, questions, word lists) in the AI usage ledger.

-- forward:
ALTER TABLE "public"."ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_event_type_check";
ALTER TABLE "public"."ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_event_type_check"
  CHECK (("event_type" = ANY (ARRAY['game_create'::"text", 'game_edit'::"text", 'game_analysis'::"text", 'game_text_generation'::"text", 'memory_update'::"text", 'voice_minutes'::"text"])));

-- reverse:
-- ALTER TABLE "public"."ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_event_type_check";
-- ALTER TABLE "public"."ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_event_type_check"
--   CHECK (("event_type" = ANY (ARRAY['game_create'::"text", 'game_edit'::"text", 'game_analysis'::"text", 'memory_update'::"text", 'voice_minutes'::"text"])));
