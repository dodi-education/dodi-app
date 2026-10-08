-- custom_tricks: tricks a kid taught one of their companions.
--
-- In the Playground ("Teach a trick") or by voice, the kid describes a trick;
-- the parent's thinking model writes it as a motion script (poses of bone
-- rotations, see core/character/src/motion-script.ts) in the browser, and the
-- client seals it. trick_enc is one enc:v1 JSON record { v, name,
-- description, model, requiredBones, script }: the server never sees the
-- trick's name, the kid's words or even which bones it moves.
--
-- Account consistency: the companion FK is composite (companion_id,
-- account_id) like companions' kid FK, since FK checks bypass RLS.
--
-- ai_usage_logs.event_type gains 'custom_trick' for the thinking-model call
-- that writes a trick.

CREATE TABLE public.custom_tricks (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  companion_id uuid NOT NULL,
  trick_enc text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT custom_tricks_companion_account_fkey FOREIGN KEY (companion_id, account_id)
    REFERENCES public.companions(id, account_id) ON DELETE CASCADE
);

CREATE INDEX custom_tricks_companion_id_idx ON public.custom_tricks (companion_id);

ALTER TABLE public.custom_tricks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom tricks" ON public.custom_tricks
  FOR SELECT USING (app.current_account_id() = account_id);
CREATE POLICY "Users can create custom tricks for own account" ON public.custom_tricks
  FOR INSERT WITH CHECK (app.current_account_id() = account_id);
CREATE POLICY "Users can update own custom tricks" ON public.custom_tricks
  FOR UPDATE USING (app.current_account_id() = account_id);
CREATE POLICY "Users can delete own custom tricks" ON public.custom_tricks
  FOR DELETE USING (app.current_account_id() = account_id);

COMMENT ON TABLE public.custom_tricks IS
  'Tricks a kid taught a companion: sealed motion scripts written by the parent''s thinking model in the browser.';
COMMENT ON COLUMN public.custom_tricks.trick_enc IS
  'enc:v1 sealed JSON { v, name, description, model, requiredBones, script }. Server cannot decrypt.';

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
    'custom_trick'::text,
    'voice_minutes'::text
  ])));

-- reverse:
-- DELETE FROM public.ai_usage_logs WHERE event_type = 'custom_trick';
--
-- ALTER TABLE public.ai_usage_logs
--   DROP CONSTRAINT ai_usage_logs_event_type_check;
--
-- ALTER TABLE public.ai_usage_logs
--   ADD CONSTRAINT ai_usage_logs_event_type_check CHECK ((event_type = ANY (ARRAY[
--     'game_create'::text,
--     'game_edit'::text,
--     'game_plan'::text,
--     'game_analysis'::text,
--     'game_text_generation'::text,
--     'game_translation'::text,
--     'memory_update'::text,
--     'voice_minutes'::text
--   ])));
--
-- DROP TABLE public.custom_tricks;
