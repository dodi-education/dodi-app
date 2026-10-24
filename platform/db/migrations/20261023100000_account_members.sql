-- account_members: which people (auth_users) may act as which family (accounts).
--
-- Until now a login was a family: accounts.id IS auth_users.id and the
-- platform resolved a session straight to `accountId = user.id`. Family
-- members (a co-parent, grandparents) need several logins on one family, and
-- one login may later belong to several families, so membership becomes its
-- own n:m row. No unique constraint on user_id alone.
--
-- Nothing changes for existing families: every account gets an `owner` row
-- for the login it was created with (user_id = accounts.id), accounts keep
-- their ids, and every RLS policy keeps reading app.current_account_id().
--
--   role  owner      the login that created the family (full access); exactly
--                    one per family
--         co_parent  another adult with full access
--         member     another adult limited to granted scopes (later)
--
-- auth_sessions.active_account_id: the family a login session acts as.
-- The platform resolves it on every request and checks it against
-- account_members. A new session starts in the login's family when it has
-- exactly one (handle_new_session); with several it stays NULL until the
-- person picks one. Existing sessions are backfilled with their login's
-- family.
--
-- app.current_user_id() (GUC app.user_id) is the person behind a user
-- request, next to app.current_account_id(). A member may read the
-- memberships of the family it acts as and its own memberships elsewhere
-- (for choosing a family later). Rows are written only through the service
-- handle, after the service checked the caller's role, so no write policy.

CREATE FUNCTION app.current_user_id() RETURNS uuid
    LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;

GRANT EXECUTE ON FUNCTION app.current_user_id() TO dodi_app, dodi_service;

CREATE TABLE public.account_members (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.auth_users(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT account_members_account_user_key UNIQUE (account_id, user_id),
  CONSTRAINT account_members_role_check
    CHECK (role IN ('owner', 'co_parent', 'member'))
);

CREATE INDEX account_members_user_id_idx ON public.account_members (user_id);

CREATE UNIQUE INDEX account_members_one_owner_idx
  ON public.account_members (account_id) WHERE role = 'owner';

CREATE TRIGGER account_members_updated_at
  BEFORE UPDATE ON public.account_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.account_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their family and own memberships" ON public.account_members
  FOR SELECT USING (
    app.current_account_id() = account_id OR app.current_user_id() = user_id
  );

COMMENT ON TABLE public.account_members IS
  'Which logins (auth_users) may act as which family (accounts). n:m; the creating login is the owner.';
COMMENT ON COLUMN public.account_members.role IS
  'owner = created the family; co_parent = another adult with full access; member = another adult limited to granted scopes.';

-- Every existing family: its creating login becomes the owner, a member
-- since the family began.
INSERT INTO public.account_members (account_id, user_id, role, created_at, updated_at)
SELECT id, id, 'owner', created_at, created_at FROM public.accounts;

ALTER TABLE public.auth_sessions
  ADD COLUMN active_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX auth_sessions_active_account_id_idx
  ON public.auth_sessions (active_account_id);

COMMENT ON COLUMN public.auth_sessions.active_account_id IS
  'The family this login session acts as; checked against account_members on every request.';

UPDATE public.auth_sessions s
SET active_account_id = s.user_id
WHERE EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = s.user_id);

-- A new login session starts in the login's only family.
CREATE FUNCTION public.handle_new_session() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
begin
  if new.active_account_id is null then
    select (array_agg(m.account_id))[1] into new.active_account_id
    from public.account_members m
    where m.user_id = new.user_id
    having count(*) = 1;
  end if;
  return new;
end;
$$;

REVOKE ALL ON FUNCTION public.handle_new_session() FROM PUBLIC;

CREATE TRIGGER auth_sessions_active_account
  BEFORE INSERT ON public.auth_sessions
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_session();

-- New sign-ups: the family and its owner membership, atomically with the user.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_code text;
begin
  insert into public.accounts (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  insert into public.account_members (account_id, user_id, role)
  values (new.id, new.id, 'owner')
  on conflict (account_id, user_id) do nothing;

  -- Record an invite-code redemption if one was supplied at signup (the
  -- registration gate in lib/auth.ts already validated it). Recording must
  -- never block signup.
  v_code := nullif(btrim(new.invite_code), '');
  if v_code is not null then
    perform public.redeem_invite_code(v_code, new.id);
  end if;

  return new;
end;
$$;

-- reverse:
-- CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
--     LANGUAGE plpgsql SECURITY DEFINER
--     AS $$
-- declare
--   v_code text;
-- begin
--   insert into public.accounts (id, email)
--   values (new.id, new.email)
--   on conflict (id) do nothing;
--   v_code := nullif(btrim(new.invite_code), '');
--   if v_code is not null then
--     perform public.redeem_invite_code(v_code, new.id);
--   end if;
--   return new;
-- end;
-- $$;
-- DROP TRIGGER auth_sessions_active_account ON public.auth_sessions;
-- DROP FUNCTION public.handle_new_session();
-- DROP INDEX public.auth_sessions_active_account_id_idx;
-- ALTER TABLE public.auth_sessions DROP COLUMN active_account_id;
-- DROP TABLE public.account_members;
-- DROP FUNCTION app.current_user_id();
