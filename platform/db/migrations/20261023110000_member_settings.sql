-- Per-person settings for family members.
--
-- With several adults on one family, two account settings belong to the
-- person rather than the family:
--
--   user_settings.language                    the login's UI and email language
--   account_members.notification_preferences  which emails this member gets
--                                             about this family (same shape as
--                                             accounts.notification_preferences)
--
-- Everything that shapes what the kids see or how the family's devices behave
-- (date format, interface toggles, screenshot service, parent PIN) stays on
-- accounts. accounts.language stays as the family's language for devices and
-- agents; the owner's language change keeps writing it.
--
-- feedback_messages.sender_user_id: the login that wrote a message, so the
-- operator's reply reaches that person rather than the family's owner.
--
-- Backfill: each login gets its family's language, each membership the
-- family's notification toggles (today every family has one login, its owner).

CREATE TABLE public.user_settings (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES public.auth_users(id) ON DELETE CASCADE,
  language text DEFAULT 'en'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT user_settings_language_length_check CHECK (char_length(language) BETWEEN 2 AND 5)
);

CREATE TRIGGER user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT USING (app.current_user_id() = user_id);
CREATE POLICY "Users can create own settings" ON public.user_settings
  FOR INSERT WITH CHECK (app.current_user_id() = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE USING (app.current_user_id() = user_id)
  WITH CHECK (app.current_user_id() = user_id);

COMMENT ON TABLE public.user_settings IS
  'Settings of a login (a person), independent of the families it belongs to.';
COMMENT ON COLUMN public.user_settings.language IS
  'The person''s UI and email language (BCP-47 short code, e.g. en/de).';

INSERT INTO public.user_settings (user_id, language)
SELECT u.id, coalesce(a.language, 'en')
FROM public.auth_users u
LEFT JOIN public.accounts a ON a.id = u.id;

ALTER TABLE public.account_members
  ADD COLUMN notification_preferences jsonb
    DEFAULT '{"friend_approval_email": true}'::jsonb NOT NULL;

COMMENT ON COLUMN public.account_members.notification_preferences IS
  'Plaintext opt-out email toggles of this member for this family ({ friend_approval_email, publication_outcome_email }). Read server-side to decide whether to send.';

UPDATE public.account_members m
SET notification_preferences = a.notification_preferences
FROM public.accounts a
WHERE a.id = m.account_id;

ALTER TABLE public.feedback_messages
  ADD COLUMN sender_user_id uuid REFERENCES public.auth_users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.feedback_messages.sender_user_id IS
  'The login that wrote the message (Reply-To goes to its email); NULL for carried-over reports.';

-- New sign-ups: their settings row too.
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

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

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
--   v_code := nullif(btrim(new.invite_code), '');
--   if v_code is not null then
--     perform public.redeem_invite_code(v_code, new.id);
--   end if;
--   return new;
-- end;
-- $$;
-- ALTER TABLE public.feedback_messages DROP COLUMN sender_user_id;
-- ALTER TABLE public.account_members DROP COLUMN notification_preferences;
-- DROP TABLE public.user_settings;
