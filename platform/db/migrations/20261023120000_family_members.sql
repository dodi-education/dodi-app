-- Family members: personal keys, invitations, and families that outlive a login.
--
-- The family's data is sealed under its vault master key (VMK). The owner
-- opens it as today, from accounts.vault_keys. Every other member opens it in
-- two steps, and never writes the family's blob:
--
--   user_keys.vault_keys          the member's personal key (a 32-byte seed),
--                                 wrapped by their own password and their own
--                                 devices; same shape as accounts.vault_keys
--   user_keys.kem_public_key      the ML-KEM key derived from that seed
--   account_members.member_vmk_wrap   the family's VMK wrapped to it
--
-- Invitations are asynchronous. The inviter's browser seals the VMK under a
-- random link secret (account_invitations.vmk_invite_wrap); the secret travels
-- only in the link's #fragment, which the inviter sends through their own
-- channel, so the server cannot open it. Accepting needs a login whose
-- verified email is the invited one; the client re-wraps the VMK to the new
-- member's personal key and the invitation's wrap is erased. One pending
-- invitation per family and address (a new one replaces it).
--
-- A login created from an invitation gets no family of its own
-- (auth_users.family_invitation_id, set by the join sign-up).
--
-- accounts.id stops referencing auth_users: a family is no longer the same
-- thing as its first login (deleting it is explicit, see
-- services/account-deletion.ts, and new families may get their own ids).
--
-- Who did it: authorized_clients.user_id (whose browser or app),
-- activities.actor_user_id (the parent behind an activity, when a person).

CREATE TABLE public.user_keys (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES public.auth_users(id) ON DELETE CASCADE,
  kem_public_key text NOT NULL,
  sign_public_key text NOT NULL,
  vault_keys jsonb NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_keys_kem_public_key_length_check CHECK (char_length(kem_public_key) <= 4000),
  CONSTRAINT user_keys_sign_public_key_length_check CHECK (char_length(sign_public_key) <= 4000)
);

CREATE TRIGGER user_keys_updated_at
  BEFORE UPDATE ON public.user_keys
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own keys" ON public.user_keys
  FOR SELECT USING (app.current_user_id() = user_id);
CREATE POLICY "Users can update own keys" ON public.user_keys
  FOR UPDATE USING (app.current_user_id() = user_id)
  WITH CHECK (app.current_user_id() = user_id);

COMMENT ON TABLE public.user_keys IS
  'A login''s personal key (for families it joined): public keys in the clear, the seed wrapped by its password and devices. Opaque to the server.';

ALTER TABLE public.account_members
  ADD COLUMN member_vmk_wrap jsonb,
  ADD COLUMN invited_by_user_id uuid REFERENCES public.auth_users(id) ON DELETE SET NULL,
  ADD CONSTRAINT account_members_vmk_wrap_check
    CHECK (role = 'owner' OR member_vmk_wrap IS NOT NULL);

COMMENT ON COLUMN public.account_members.member_vmk_wrap IS
  'Non-owners: the family''s vault key wrapped (ML-KEM) to the member''s user_keys.kem_public_key. Opaque to the server.';

CREATE TABLE public.account_invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  role text NOT NULL,
  vmk_invite_wrap text,
  invited_by_user_id uuid REFERENCES public.auth_users(id) ON DELETE SET NULL,
  expires_at timestamp with time zone NOT NULL,
  accepted_at timestamp with time zone,
  accepted_by_user_id uuid REFERENCES public.auth_users(id) ON DELETE SET NULL,
  revoked_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT account_invitations_role_check CHECK (role IN ('co_parent', 'member')),
  CONSTRAINT account_invitations_email_length_check CHECK (char_length(invited_email) BETWEEN 3 AND 320),
  CONSTRAINT account_invitations_wrap_length_check CHECK (char_length(vmk_invite_wrap) <= 4000),
  CONSTRAINT account_invitations_pending_wrap_check
    CHECK (accepted_at IS NOT NULL OR revoked_at IS NOT NULL OR vmk_invite_wrap IS NOT NULL)
);

CREATE UNIQUE INDEX account_invitations_one_pending_idx
  ON public.account_invitations (account_id, lower(invited_email))
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE public.account_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own family invitations" ON public.account_invitations
  FOR SELECT USING (app.current_account_id() = account_id);

COMMENT ON TABLE public.account_invitations IS
  'Pending and past invitations into a family. vmk_invite_wrap is the VMK sealed under a link secret the server never sees; erased once accepted or revoked.';

ALTER TABLE public.authorized_clients
  ADD COLUMN user_id uuid REFERENCES public.auth_users(id) ON DELETE CASCADE;

UPDATE public.authorized_clients c
SET user_id = c.account_id
WHERE c.kind IN ('browser', 'app')
  AND c.account_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.auth_users u WHERE u.id = c.account_id);

COMMENT ON COLUMN public.authorized_clients.user_id IS
  'Browsers and apps: the login whose device it is. NULL for the robot and agents.';

ALTER TABLE public.activities
  ADD COLUMN actor_user_id uuid REFERENCES public.auth_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.activities.actor_user_id IS
  'The parent (login) who caused the activity, when a person did; NULL for kids'' devices.';

ALTER TABLE public.auth_users ADD COLUMN family_invitation_id uuid;

ALTER TABLE public.accounts DROP CONSTRAINT accounts_id_fkey;

-- New sign-ups: a family of their own, unless they signed up to join one.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
declare
  v_code text;
begin
  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  -- Joining a family: the membership is created when the invitation is
  -- accepted (it needs the client's key wrap), not here.
  if new.family_invitation_id is not null then
    return new;
  end if;

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
--   insert into public.account_members (account_id, user_id, role)
--   values (new.id, new.id, 'owner')
--   on conflict (account_id, user_id) do nothing;
--   insert into public.user_settings (user_id)
--   values (new.id)
--   on conflict (user_id) do nothing;
--   v_code := nullif(btrim(new.invite_code), '');
--   if v_code is not null then
--     perform public.redeem_invite_code(v_code, new.id);
--   end if;
--   return new;
-- end;
-- $$;
-- DELETE FROM public.accounts a WHERE NOT EXISTS (SELECT 1 FROM public.auth_users u WHERE u.id = a.id);
-- ALTER TABLE public.accounts ADD CONSTRAINT accounts_id_fkey FOREIGN KEY (id) REFERENCES public.auth_users(id) ON DELETE CASCADE;
-- ALTER TABLE public.auth_users DROP COLUMN family_invitation_id;
-- ALTER TABLE public.activities DROP COLUMN actor_user_id;
-- ALTER TABLE public.authorized_clients DROP COLUMN user_id;
-- DROP TABLE public.account_invitations;
-- DELETE FROM public.account_members WHERE role <> 'owner';
-- ALTER TABLE public.account_members
--   DROP CONSTRAINT account_members_vmk_wrap_check,
--   DROP COLUMN invited_by_user_id,
--   DROP COLUMN member_vmk_wrap;
-- DROP TABLE public.user_keys;
