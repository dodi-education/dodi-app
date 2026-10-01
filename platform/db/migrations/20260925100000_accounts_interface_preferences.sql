-- accounts.interface_preferences: account-level look-and-feel toggles for the
-- app itself (parent and kid views), set under Settings > General > Interface.
--
-- Shape: {"is_3d_enabled"?: boolean}. Opt-out, like notification_preferences:
-- an absent key reads as the default (today: on), so the default can move in
-- the client without a backfill. Plaintext on purpose: these are rendering
-- choices that reveal nothing about the family. Partial updates are merged
-- server-side so saving one toggle never clobbers another.

ALTER TABLE public.accounts
  ADD COLUMN interface_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.accounts.interface_preferences IS
  'Plaintext interface toggles ({ is_3d_enabled? }); absent keys read as the client default. Merged on update.';

-- reverse:
-- ALTER TABLE public.accounts DROP COLUMN interface_preferences;
