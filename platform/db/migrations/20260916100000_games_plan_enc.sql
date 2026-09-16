-- games.plan_enc: the studio's Plan step, persisted.
--
-- A game draft used to exist only in the browser until the parent saved its
-- settings, so leaving the Plan step (brainstorming with the plan agent, a
-- sketch, a photo, the plan on the table) lost all of it. Now the first plan
-- turn creates the row, and the Plan step's state rides along in this column:
-- the plan summary, whether the parent accepted it, and the sketch/photo the
-- conversation refers to. The conversation itself stays in agent_transcript_enc.
--
-- The column doubles as the stage marker: non-NULL means the game is still in
-- the Plan step (the studio reopens there; the build chat stays locked). Saving
-- the settings, which is what ends planning, clears it.
--
-- E2EE like agent_transcript_enc: an enc:v1: JSON envelope sealed under the
-- account vault key. The server stores and returns it verbatim and never reads
-- it (it is not copied to publication forks, which are built from the
-- plaintext submission).

ALTER TABLE public.games
  ADD COLUMN plan_enc text;

COMMENT ON COLUMN public.games.plan_enc IS
  'E2EE enc:v1: JSON envelope of the studio Plan step (plan summary, accepted flag, sketch/photo), sealed under the account VMK. Non-NULL = the game is still being planned; cleared when the settings are saved. Server cannot decrypt.';

-- reverse:
-- ALTER TABLE public.games DROP COLUMN plan_enc;
