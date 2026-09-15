-- ai_usage_logs.event_type: add 'game_plan'.
--
-- The game studio's new Plan step runs its own provider calls before any code
-- exists: the brainstorming turns with the plan agent, and the one structured
-- call that derives the game settings from the accepted plan. That spend is
-- real and parent-visible, so it gets its own event type instead of being
-- folded into 'game_create' (which counts built games).
--
-- Plan rows carry no game_id: the draft row does not exist yet while planning.

ALTER TABLE public.ai_usage_logs
  DROP CONSTRAINT ai_usage_logs_event_type_check;

ALTER TABLE public.ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_event_type_check CHECK ((event_type = ANY (ARRAY[
    'game_create'::text,
    'game_edit'::text,
    'game_plan'::text,
    'game_analysis'::text,
    'game_text_generation'::text,
    'game_translation'::text,
    'memory_update'::text,
    'voice_minutes'::text
  ])));

-- reverse:
-- DELETE FROM public.ai_usage_logs WHERE event_type = 'game_plan';
--
-- ALTER TABLE public.ai_usage_logs
--   DROP CONSTRAINT ai_usage_logs_event_type_check;
--
-- ALTER TABLE public.ai_usage_logs
--   ADD CONSTRAINT ai_usage_logs_event_type_check CHECK ((event_type = ANY (ARRAY[
--     'game_create'::text,
--     'game_edit'::text,
--     'game_analysis'::text,
--     'game_text_generation'::text,
--     'game_translation'::text,
--     'memory_update'::text,
--     'voice_minutes'::text
--   ])));
