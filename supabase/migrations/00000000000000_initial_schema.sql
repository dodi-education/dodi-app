-- Initial schema for Dodi web platform
-- Creates core tables: accounts, profiles, personalities
-- With RLS policies and auto-account creation trigger

-- ============================================================
-- ENUMS
-- ============================================================

create type public.subscription_tier as enum ('free', 'premium');

-- ============================================================
-- TABLES
-- ============================================================

-- Accounts: linked 1:1 with auth.users
create table public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  encrypted_api_keys jsonb default null,
  model_config jsonb default null,
  subscription_tier public.subscription_tier not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reverse: drop table public.accounts;

-- Kid profiles: multiple per account
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  display_name text not null,
  name_tag text not null unique,
  birthdate text default null, -- encrypted client-side or server-side
  avatar_config jsonb default null,
  active_personality_id uuid default null, -- FK added after personalities table
  memory text default null, -- encrypted markup document
  preferences jsonb default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reverse: drop table public.profiles;

-- Dodi personality presets
create table public.personalities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  name text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reverse: drop table public.personalities;

-- Add FK from profiles to personalities (deferred to avoid circular dependency)
alter table public.profiles
  add constraint profiles_active_personality_id_fkey
  foreign key (active_personality_id)
  references public.personalities(id)
  on delete set null;

-- ============================================================
-- INDEXES
-- ============================================================

create index profiles_account_id_idx on public.profiles(account_id);
create index personalities_account_id_idx on public.personalities(account_id);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger accounts_updated_at
  before update on public.accounts
  for each row execute function public.handle_updated_at();

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

create trigger personalities_updated_at
  before update on public.personalities
  for each row execute function public.handle_updated_at();

-- ============================================================
-- AUTO-CREATE ACCOUNT ON SIGNUP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.accounts (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.personalities enable row level security;

-- Accounts: users can only read/update their own account
create policy "Users can view own account"
  on public.accounts for select
  using (auth.uid() = id);

create policy "Users can update own account"
  on public.accounts for update
  using (auth.uid() = id);

-- Profiles: users can CRUD profiles belonging to their account
create policy "Users can view own profiles"
  on public.profiles for select
  using (auth.uid() = account_id);

create policy "Users can create profiles for own account"
  on public.profiles for insert
  with check (auth.uid() = account_id);

create policy "Users can update own profiles"
  on public.profiles for update
  using (auth.uid() = account_id);

create policy "Users can delete own profiles"
  on public.profiles for delete
  using (auth.uid() = account_id);

-- Personalities: users can CRUD personalities belonging to their account
create policy "Users can view own personalities"
  on public.personalities for select
  using (auth.uid() = account_id);

create policy "Users can create personalities for own account"
  on public.personalities for insert
  with check (auth.uid() = account_id);

create policy "Users can update own personalities"
  on public.personalities for update
  using (auth.uid() = account_id);

create policy "Users can delete own personalities"
  on public.personalities for delete
  using (auth.uid() = account_id);
