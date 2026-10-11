-- The `studio` scope: an agent builds games through Game Studio with the
-- family's own AI providers, exactly like the apps (dodi's game agent writes
-- the game; the family's agent briefs and reviews).
--
-- A family's provider keys live in one sealed blob the server can't split, so
-- when the parent allows `studio` their browser seals just the keys a build
-- needs (the game, image and thinking providers; never voice) to the agent's
-- own ML-KEM key, like the vault key handover (@dodi/protocol/agent-provider-keys).
--
--   provider_keys_sealed  that sealed bundle (JSON of a KEM-wrapped payload;
--                         text, never jsonb). NULL without `studio`.
--   provider_keys_set_at  when it was sealed, so a stale copy can be explained.

ALTER TABLE public.authorized_clients
  ADD COLUMN provider_keys_sealed text,
  ADD COLUMN provider_keys_set_at timestamp with time zone;

ALTER TABLE public.authorized_clients
  DROP CONSTRAINT authorized_clients_scopes_check,
  ADD CONSTRAINT authorized_clients_scopes_check CHECK (
    scopes <@ ARRAY['studio', 'games', 'games:publish', 'kids:basic', 'kids:memory', 'assets', 'assets:publish']::text[]
  ),
  ADD CONSTRAINT authorized_clients_provider_keys_agent_check CHECK (
    provider_keys_sealed IS NULL OR (kind = 'agent' AND char_length(provider_keys_sealed) <= 20000)
  );

COMMENT ON COLUMN public.authorized_clients.provider_keys_sealed IS
  'Agent with the studio scope: the family''s build provider keys (game, image, thinking), sealed client-side to the agent''s KEM key. Server cannot read it.';
COMMENT ON COLUMN public.authorized_clients.provider_keys_set_at IS
  'When provider_keys_sealed was sealed (the parent allowed the agent).';

-- reverse:
-- UPDATE public.authorized_clients SET scopes = array_remove(scopes, 'studio');
-- ALTER TABLE public.authorized_clients
--   DROP CONSTRAINT authorized_clients_provider_keys_agent_check,
--   DROP CONSTRAINT authorized_clients_scopes_check,
--   ADD CONSTRAINT authorized_clients_scopes_check CHECK (
--     scopes <@ ARRAY['games', 'games:publish', 'kids:basic', 'kids:memory', 'assets', 'assets:publish']::text[]
--   ),
--   DROP COLUMN provider_keys_set_at,
--   DROP COLUMN provider_keys_sealed;
