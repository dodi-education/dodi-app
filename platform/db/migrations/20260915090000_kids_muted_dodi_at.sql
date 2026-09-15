-- kids.muted_dodi_at: persisted OUTPUT mute for the companion.
--
-- Orthogonal to kids.deafened_dodi_at. The two answer different questions:
--   deafened_dodi_at → can dodi HEAR? (mic on/off)
--   muted_dodi_at    → can dodi be HEARD? (audio output on/off)
-- They compose freely: muted+listening means dodi still hears the child and can
-- still act, but produces no sound; muted+deaf means fully quiet on both ends.
-- While muted, game-requested speech (generate_voice) is refused with
-- voice_unavailable. NULL = not muted; a timestamp = when the kid muted her.
-- Plaintext operational state, like deafened_dodi_at.
--
-- deafened's meaning also narrows here: a deaf (but not muted) session may still
-- produce audio — specifically game-requested speech — so its comment is updated
-- to say output stays allowed.

ALTER TABLE public.kids
  ADD COLUMN muted_dodi_at timestamp with time zone;

COMMENT ON COLUMN public.kids.muted_dodi_at IS
  'Persisted output mute: NULL = dodi may produce sound; a timestamp = kid muted dodi''s audio output (no speech, game-requested speech refused). Orthogonal to deafened_dodi_at (hearing): the two compose freely.';

COMMENT ON COLUMN public.kids.deafened_dodi_at IS
  'Persisted deaf state: NULL = listens normally; a timestamp = kid turned dodi''s listening off (mic muted), so she comes up deaf on connect until re-enabled. Audio OUTPUT, including game-requested speech, stays allowed; full silence is kids.muted_dodi_at. Plaintext operational state.';

-- reverse:
-- ALTER TABLE public.kids DROP COLUMN muted_dodi_at;
--
-- COMMENT ON COLUMN public.kids.deafened_dodi_at IS 'Persisted Dodi deaf state: NULL = listens normally; a timestamp = kid muted Dodi, so she comes up deaf on connect until re-enabled. Plaintext operational state.';
