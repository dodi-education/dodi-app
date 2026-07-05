-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the newsletter signups feature (what local baseline.sql defines but a
-- `db reset` won't re-apply to remote).
--
-- Adds: newsletter_signups + record_newsletter_signup(). These back the public
-- POST /api/newsletter endpoint used by the static marketing site's forms (the
-- newsletter form binds to list 'newsletter'). Anonymous
-- prospects, no account/vault → plaintext operational data with RLS default-deny
-- (service role only), same posture as invite_codes. Valid `list` values are
-- enforced in the app (NEWSLETTER_LISTS env), not in the schema.
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.

-- --- Table (inline constraints so re-runs are no-ops) -----------------------

create table if not exists public.newsletter_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  locale text not null default 'en',
  list text not null default 'newsletter',
  status text not null default 'confirmed',
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_signups_locale_check check (locale in ('en', 'de')),
  constraint newsletter_signups_status_check check (status in ('confirmed', 'unsubscribed'))
);

-- Dedupe per list, case-insensitive; also the ON CONFLICT target below.
create unique index if not exists newsletter_signups_list_email_uniq
  on public.newsletter_signups (list, lower(email));

-- Supports the per-IP rate-limit window count.
create index if not exists newsletter_signups_ip_window_idx
  on public.newsletter_signups (ip_hash, created_at);

-- --- RLS: enabled, no policies => default-deny (service role bypasses) -------

alter table public.newsletter_signups enable row level security;

create or replace trigger newsletter_signups_updated_at
  before update on public.newsletter_signups
  for each row execute function public.handle_updated_at();

-- --- Function ---------------------------------------------------------------

create or replace function public.record_newsletter_signup(
  p_email text,
  p_locale text,
  p_list text,
  p_ip_hash text,
  p_max_per_ip integer,
  p_window interval
)
returns table(id uuid, is_new boolean, rate_limited boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email  text := lower(btrim(p_email));
  v_locale text := coalesce(nullif(p_locale, ''), 'en');
  v_list   text := coalesce(nullif(p_list, ''), 'newsletter');
  v_count  integer;
  v_id     uuid;
begin
  if p_ip_hash is not null then
    select count(*) into v_count
    from public.newsletter_signups w
    where w.ip_hash = p_ip_hash
      and w.created_at > now() - p_window;

    if v_count >= p_max_per_ip then
      return query select null::uuid, false, true;
      return;
    end if;
  end if;

  insert into public.newsletter_signups (email, locale, list, ip_hash)
  values (v_email, v_locale, v_list, p_ip_hash)
  on conflict (list, lower(email)) do nothing
  returning newsletter_signups.id into v_id;

  if v_id is not null then
    return query select v_id, true, false;
  else
    select w.id into v_id
    from public.newsletter_signups w
    where w.list = v_list
      and lower(w.email) = v_email
    limit 1;
    return query select v_id, false, false;
  end if;
end;
$$;

revoke all on function public.record_newsletter_signup(text, text, text, text, integer, interval)
  from public, anon, authenticated;
grant execute on function public.record_newsletter_signup(text, text, text, text, integer, interval)
  to service_role;

grant all on table public.newsletter_signups to anon, authenticated, service_role;
