-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the invite system + registration modes (what local baseline.sql defines
-- but a `db reset` won't re-apply to remote).
--
-- Adds: invite_codes, invite_code_redemptions, redeem_invite_code() and
-- is_invite_code_active(), and updates handle_new_user() to record redemptions.
-- Registration mode (open/invite/closed) is enforced by the platform's
-- before_user_created auth hook — no DB change needed for the mode itself.
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.

-- --- Tables (inline constraints so re-runs are no-ops) ----------------------

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  is_active boolean not null default true,
  max_uses integer,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invite_codes_code_lower_uniq
  on public.invite_codes (lower(code));

create table if not exists public.invite_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  invite_code_id uuid not null references public.invite_codes(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (invite_code_id, account_id)
);

create index if not exists invite_code_redemptions_account_idx
  on public.invite_code_redemptions (account_id);

-- --- RLS: enabled, no policies => default-deny (service role bypasses) -------

alter table public.invite_codes enable row level security;
alter table public.invite_code_redemptions enable row level security;

create or replace trigger invite_codes_updated_at
  before update on public.invite_codes
  for each row execute function public.handle_updated_at();

-- --- Functions --------------------------------------------------------------

create or replace function public.redeem_invite_code(p_code text, p_account_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_invite public.invite_codes%rowtype;
  v_uses integer;
begin
  select * into v_invite
  from public.invite_codes
  where lower(code) = lower(btrim(p_code))
    and is_active = true
  for update;

  if not found then
    return false;
  end if;

  if v_invite.max_uses is not null then
    select count(*) into v_uses
    from public.invite_code_redemptions
    where invite_code_id = v_invite.id;

    if v_uses >= v_invite.max_uses then
      return false;
    end if;
  end if;

  insert into public.invite_code_redemptions (invite_code_id, account_id)
  values (v_invite.id, p_account_id)
  on conflict (invite_code_id, account_id) do nothing;

  return true;
end;
$$;

create or replace function public.is_invite_code_active(p_code text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.invite_codes
    where lower(code) = lower(btrim(p_code))
      and is_active = true
  );
$$;

revoke all on function public.redeem_invite_code(text, uuid) from public, anon, authenticated;
grant execute on function public.redeem_invite_code(text, uuid) to service_role;
revoke all on function public.is_invite_code_active(text) from public, anon, authenticated;
grant execute on function public.is_invite_code_active(text) to service_role;

-- --- Record redemptions from signup metadata --------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  v_code text;
begin
  insert into public.accounts (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  v_code := nullif(btrim(new.raw_user_meta_data ->> 'invite_code'), '');
  if v_code is not null then
    perform public.redeem_invite_code(v_code, new.id);
  end if;

  return new;
end;
$$;

-- Optional: seed a reusable dev/beta code.
-- insert into public.invite_codes (code, note) values ('DODI-BETA', 'beta') on conflict do nothing;
