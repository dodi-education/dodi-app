-- Agent devices: a family connects its own AI agent (Claude Code, Cursor, …)
-- through the dodi CLI, which pairs exactly like the robot does (enroll with
-- ML-KEM + ML-DSA public keys → pairing code → the parent claims it in the
-- browser, which wraps the vault key to the device → activate).
--
-- Unlike a robot, an agent is limited to what the parent granted:
--   kind    'robot' (the existing hardware device, unrestricted) | 'agent'
--   scopes  what an agent may read and write. While pending it holds what the
--           CLI asked for; activation replaces it with what the parent granted.
--           Routes refuse agent bearers unless they name a scope the device has.
--   expires_at  when an agent connection stops working (NULL = never).
--
-- The scopes gate which ciphertext the server hands out. An agent holds the
-- vault key, so a scope is a server-side boundary, not a cryptographic one.

ALTER TABLE public.devices
  ADD COLUMN kind text DEFAULT 'robot' NOT NULL,
  ADD COLUMN scopes text[] DEFAULT '{}'::text[] NOT NULL,
  ADD COLUMN expires_at timestamp with time zone;

ALTER TABLE public.devices
  ADD CONSTRAINT devices_kind_check CHECK (kind IN ('robot', 'agent')),
  ADD CONSTRAINT devices_scopes_check CHECK (
    scopes <@ ARRAY['games', 'games:publish', 'kids:basic', 'kids:memory', 'assets', 'assets:publish']::text[]
  ),
  ADD CONSTRAINT devices_robot_unscoped_check CHECK (kind = 'agent' OR (scopes = '{}'::text[] AND expires_at IS NULL));

COMMENT ON COLUMN public.devices.kind IS
  'robot = the hardware companion (unrestricted device bearer); agent = a family''s own AI agent connected through the dodi CLI (scoped).';
COMMENT ON COLUMN public.devices.scopes IS
  'Agent only. Pending: the scopes the CLI requested. Active: the scopes the parent granted. Values: games, games:publish, kids:basic, kids:memory, assets, assets:publish.';
COMMENT ON COLUMN public.devices.expires_at IS
  'Agent only. The connection stops working after this instant; NULL = no expiry.';

-- reverse:
-- ALTER TABLE public.devices
--   DROP CONSTRAINT devices_robot_unscoped_check,
--   DROP CONSTRAINT devices_scopes_check,
--   DROP CONSTRAINT devices_kind_check,
--   DROP COLUMN expires_at,
--   DROP COLUMN scopes,
--   DROP COLUMN kind;
