-- accounts.encrypted_api_keys: jsonb -> text
--
-- The column dates from the pre-E2EE design, where it held a readable map of
-- per-provider records ({"xai": {...}, "anthropic": {...}}) that the server
-- sealed itself. Under client-side E2EE it holds ONE opaque `enc:v1:` blob the
-- browser sealed under the account VMK, so the jsonb type is now wrong twice
-- over: the server never looks inside it, and binding the blob as a query
-- parameter fails outright, because a `enc:v1:...` string is not valid JSON
-- ("invalid input syntax for type json") — no provider key could be saved.
--
-- Every other single-blob E2EE column is already text (kids.avatar_config,
-- kids.memory, games.agent_transcript_enc, game_snapshots.payload_enc, …);
-- this one was simply missed when the keys moved client-side.
--
-- `#>> '{}'` converts losslessly in both directions: a jsonb string scalar
-- unwraps to the bare string, and a legacy provider map becomes its JSON text
-- (unreadable either way — it is ciphertext under the retired server secret).

ALTER TABLE public.accounts
  ALTER COLUMN encrypted_api_keys TYPE text
  USING encrypted_api_keys #>> '{}';

COMMENT ON COLUMN public.accounts.encrypted_api_keys IS
  'E2EE enc:v1: blob holding the whole provider-keys map (key, keyPreview, addedAt per provider), sealed client-side under the account VMK. Server stores and returns it verbatim and cannot decrypt.';

-- reverse:
-- ALTER TABLE public.accounts
--   ALTER COLUMN encrypted_api_keys TYPE jsonb
--   USING to_jsonb(encrypted_api_keys);
--
-- COMMENT ON COLUMN public.accounts.encrypted_api_keys IS NULL;
