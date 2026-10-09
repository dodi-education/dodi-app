-- authorized_clients: one list of everything that can open a family's vault.
--
-- Under end-to-end encryption the real authorization is holding a copy of the
-- vault key (an entry in accounts.vault_keys.deviceWraps). Until now only the
-- robot and agents had a row (in `devices`); browsers and the mobile app held
-- a wrap and a login session but appeared nowhere, so a parent could not see
-- or revoke a lost phone. This renames `devices` to `authorized_clients` and
-- gives every wrap holder a row:
--
--   kind        browser | app (signed-in clients, registered when they add their
--               own wrap) | robot | agent (paired through enroll → claim → activate)
--   session_id  a browser's or app's login session; revoking deletes it too
--   label       a coarse, non-identifying description the client builds itself
--               ("Firefox on Linux"), never a hostname or device model
--
-- The wraps stay in accounts.vault_keys (format unchanged); device_id is the
-- join key. Existing wraps without a row are backfilled as `browser` rows with
-- no label ("Unknown device" until that client next unlocks and registers).
-- sign_public_key becomes optional: only robots and agents sign challenges.

ALTER TABLE public.devices RENAME TO authorized_clients;
ALTER TABLE public.authorized_clients RENAME CONSTRAINT devices_pkey TO authorized_clients_pkey;
ALTER TABLE public.authorized_clients RENAME CONSTRAINT devices_account_device_uniq TO authorized_clients_account_device_uniq;
ALTER TABLE public.authorized_clients RENAME CONSTRAINT devices_account_id_fkey TO authorized_clients_account_id_fkey;
ALTER TABLE public.authorized_clients RENAME CONSTRAINT devices_scopes_check TO authorized_clients_scopes_check;
ALTER INDEX public.devices_account_idx RENAME TO authorized_clients_account_idx;
ALTER INDEX public.devices_pairing_code_idx RENAME TO authorized_clients_pairing_code_idx;
ALTER TRIGGER devices_updated_at ON public.authorized_clients RENAME TO authorized_clients_updated_at;
ALTER POLICY "Users manage own devices" ON public.authorized_clients RENAME TO "Users manage own authorized clients";

ALTER TABLE public.authorized_clients
  DROP CONSTRAINT devices_kind_check,
  DROP CONSTRAINT devices_robot_unscoped_check;

ALTER TABLE public.authorized_clients
  ALTER COLUMN kind DROP DEFAULT,
  ALTER COLUMN sign_public_key DROP NOT NULL,
  ADD COLUMN session_id uuid REFERENCES public.auth_sessions(id) ON DELETE SET NULL,
  ADD COLUMN label text;

ALTER TABLE public.authorized_clients
  ADD CONSTRAINT authorized_clients_kind_check CHECK (kind IN ('browser', 'app', 'robot', 'agent')),
  ADD CONSTRAINT authorized_clients_agent_only_scopes_check CHECK (
    kind = 'agent' OR (scopes = '{}'::text[] AND expires_at IS NULL)
  ),
  ADD CONSTRAINT authorized_clients_paired_sign_key_check CHECK (
    kind NOT IN ('robot', 'agent') OR sign_public_key IS NOT NULL
  ),
  ADD CONSTRAINT authorized_clients_label_length_check CHECK (label IS NULL OR char_length(label) <= 80);

CREATE INDEX authorized_clients_session_id_idx ON public.authorized_clients (session_id);

-- Every existing wrap without a row becomes a browser row.
INSERT INTO public.authorized_clients (account_id, device_id, kem_public_key, kind, status, enrolled_at)
SELECT a.id, wrap->>'deviceId', wrap->>'deviceKemPublicKey', 'browser', 'active', now()
FROM public.accounts a
CROSS JOIN LATERAL jsonb_array_elements(COALESCE(a.vault_keys->'deviceWraps', '[]'::jsonb)) AS wrap
WHERE wrap->>'deviceId' IS NOT NULL
  AND wrap->>'deviceKemPublicKey' IS NOT NULL
ON CONFLICT (account_id, device_id) DO NOTHING;

COMMENT ON TABLE public.authorized_clients IS
  'Everything that can open the family vault (holds an entry in accounts.vault_keys.deviceWraps, joined by device_id): browsers, the app, the robot, agents.';
COMMENT ON COLUMN public.authorized_clients.kind IS
  'browser | app (signed in, registered when adding its own wrap) | robot | agent (paired via enroll/claim/activate; agents are scoped).';
COMMENT ON COLUMN public.authorized_clients.session_id IS
  'Browser/app only: its login session. Revoking the client deletes the session too.';
COMMENT ON COLUMN public.authorized_clients.label IS
  'Coarse, non-identifying description built by the client ("Firefox on Linux"). NULL = unknown.';

-- reverse:
-- DELETE FROM public.authorized_clients WHERE kind IN ('browser', 'app');
-- DROP INDEX public.authorized_clients_session_id_idx;
-- ALTER TABLE public.authorized_clients
--   DROP CONSTRAINT authorized_clients_label_length_check,
--   DROP CONSTRAINT authorized_clients_paired_sign_key_check,
--   DROP CONSTRAINT authorized_clients_agent_only_scopes_check,
--   DROP CONSTRAINT authorized_clients_kind_check,
--   DROP COLUMN label,
--   DROP COLUMN session_id,
--   ALTER COLUMN sign_public_key SET NOT NULL,
--   ALTER COLUMN kind SET DEFAULT 'robot';
-- ALTER TABLE public.authorized_clients
--   ADD CONSTRAINT devices_kind_check CHECK (kind IN ('robot', 'agent')),
--   ADD CONSTRAINT devices_robot_unscoped_check CHECK (kind = 'agent' OR (scopes = '{}'::text[] AND expires_at IS NULL));
-- ALTER POLICY "Users manage own authorized clients" ON public.authorized_clients RENAME TO "Users manage own devices";
-- ALTER TRIGGER authorized_clients_updated_at ON public.authorized_clients RENAME TO devices_updated_at;
-- ALTER INDEX public.authorized_clients_pairing_code_idx RENAME TO devices_pairing_code_idx;
-- ALTER INDEX public.authorized_clients_account_idx RENAME TO devices_account_idx;
-- ALTER TABLE public.authorized_clients RENAME CONSTRAINT authorized_clients_scopes_check TO devices_scopes_check;
-- ALTER TABLE public.authorized_clients RENAME CONSTRAINT authorized_clients_account_id_fkey TO devices_account_id_fkey;
-- ALTER TABLE public.authorized_clients RENAME CONSTRAINT authorized_clients_account_device_uniq TO devices_account_device_uniq;
-- ALTER TABLE public.authorized_clients RENAME CONSTRAINT authorized_clients_pkey TO devices_pkey;
-- ALTER TABLE public.authorized_clients RENAME TO devices;
