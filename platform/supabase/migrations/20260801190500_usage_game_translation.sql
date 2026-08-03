-- Allow the client-side publish-translate usage event (translating a game's
-- strings + listing into every platform locale with the parent's own AI
-- provider) in the AI usage ledger.

-- forward:
ALTER TABLE "public"."ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_event_type_check";
ALTER TABLE "public"."ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_event_type_check"
  CHECK (("event_type" = ANY (ARRAY['game_create'::"text", 'game_edit'::"text", 'game_analysis'::"text", 'game_text_generation'::"text", 'game_translation'::"text", 'memory_update'::"text", 'voice_minutes'::"text"])));

-- reverse:
-- ALTER TABLE "public"."ai_usage_logs" DROP CONSTRAINT "ai_usage_logs_event_type_check";
-- ALTER TABLE "public"."ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_event_type_check"
--   CHECK (("event_type" = ANY (ARRAY['game_create'::"text", 'game_edit'::"text", 'game_analysis'::"text", 'game_text_generation'::"text", 'memory_update'::"text", 'voice_minutes'::"text"])));
