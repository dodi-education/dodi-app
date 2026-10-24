-- Scoped family members: what a `member` (not owner, not co-parent) may do.
--
-- Same vocabulary and the same rule as agents (@dodi/protocol/agent-scopes):
-- a route a scoped member may reach names the scope it needs, everything else
-- refuses them. Owners and co-parents are never scoped (empty array).
-- An invitation carries the scopes the member will get.
--
-- The scopes gate which ciphertext the server hands out. A member holds the
-- family's vault key, so a scope is a server-side boundary, not a
-- cryptographic one (the same as for agents).

ALTER TABLE public.account_members
  ADD COLUMN scopes text[] DEFAULT '{}'::text[] NOT NULL,
  ADD CONSTRAINT account_members_scopes_check CHECK (
    scopes <@ ARRAY['studio', 'games', 'games:publish', 'kids:basic', 'kids:memory', 'assets', 'assets:publish']::text[]
  ),
  ADD CONSTRAINT account_members_unscoped_roles_check CHECK (role = 'member' OR scopes = '{}'::text[]);

ALTER TABLE public.account_invitations
  ADD COLUMN scopes text[] DEFAULT '{}'::text[] NOT NULL,
  ADD CONSTRAINT account_invitations_scopes_check CHECK (
    scopes <@ ARRAY['studio', 'games', 'games:publish', 'kids:basic', 'kids:memory', 'assets', 'assets:publish']::text[]
  ),
  ADD CONSTRAINT account_invitations_unscoped_roles_check CHECK (role = 'member' OR scopes = '{}'::text[]);

COMMENT ON COLUMN public.account_members.scopes IS
  'Role member only: what this person may read and write (agent scope vocabulary). Empty for owner and co-parents, who have full access.';
COMMENT ON COLUMN public.account_invitations.scopes IS
  'Role member only: the scopes the invited person gets on joining.';

-- reverse:
-- ALTER TABLE public.account_invitations
--   DROP CONSTRAINT account_invitations_unscoped_roles_check,
--   DROP CONSTRAINT account_invitations_scopes_check,
--   DROP COLUMN scopes;
-- ALTER TABLE public.account_members
--   DROP CONSTRAINT account_members_unscoped_roles_check,
--   DROP CONSTRAINT account_members_scopes_check,
--   DROP COLUMN scopes;
