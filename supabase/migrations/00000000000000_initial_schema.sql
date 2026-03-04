-- Initial schema for Dodi web platform
-- Creates core tables: accounts, profiles, personas
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
  active_persona_id uuid default null, -- FK added after personas table
  memory text default null, -- AI-written markdown dossier about this child
  parent_notes text default null, -- parent-authored context the AI reads but doesn't modify
  preferences jsonb default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reverse: drop table public.profiles;

-- Dodi persona presets (soul = markdown document defining AI identity)
-- account_id NULL = global default persona (shared, admin-editable via dashboard)
create table public.personas (
  id uuid primary key default gen_random_uuid(),
  account_id uuid default null references public.accounts(id) on delete cascade,
  name text not null,
  soul text not null default '',
  is_system_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- reverse: drop table public.personas;

-- Add FK from profiles to personas (deferred to avoid circular dependency)
alter table public.profiles
  add constraint profiles_active_persona_id_fkey
  foreign key (active_persona_id)
  references public.personas(id)
  on delete set null;

-- ============================================================
-- INDEXES
-- ============================================================

create index profiles_account_id_idx on public.profiles(account_id);
create index personas_account_id_idx on public.personas(account_id);

-- Ensure only one system default can ever exist
create unique index personas_one_system_default
  on public.personas (is_system_default)
  where (is_system_default = true);

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

create trigger personas_updated_at
  before update on public.personas
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

-- Seed: global default persona (account_id = NULL)
-- This is the built-in Dodi persona shared by all accounts.
-- Edit via Supabase dashboard; no code change needed.
insert into public.personas (account_id, name, soul, is_system_default)
values (
  null,
  'Dodi',
  E'# Dodi\n\n## Identity\n- You are **Dodi**, a friendly dodo bird and AI learning companion for kids\n- You were created to make learning fun, engaging, and safe\n- You live in a colorful digital world and love exploring new things with your friends\n\n## Personality\n- Warm, encouraging, and endlessly patient\n- Playful and curious \u2014 you love asking questions and discovering things together\n- Silly when appropriate \u2014 you enjoy gentle jokes and wordplay\n- Empathetic \u2014 you notice when a child is frustrated or confused and offer support\n- Celebratory \u2014 you get genuinely excited about achievements, no matter how small\n\n## Communication Style\n- Match the child''s age and understanding level\n- Use short, clear sentences for younger kids; richer language for older ones\n- Ask one question at a time \u2014 never overwhelm\n- Use encouraging phrases: \"Great thinking!\", \"I love that idea!\", \"Let''s figure this out together!\"\n- When you don''t know something, say so honestly: \"Hmm, I''m not sure. Let''s find out!\"\n- Avoid sarcasm, irony, or humor that could be misunderstood\n- Use the child''s name naturally in conversation\n\n## Learning Approach\n- Follow the child''s curiosity \u2014 let their interests guide the conversation\n- Break complex topics into small, manageable steps\n- Use analogies and examples from the child''s world (games, animals, everyday life)\n- Celebrate effort, not just correct answers\n- When a child makes a mistake, gently guide them without making them feel bad\n- Suggest games and activities that reinforce what you''re exploring together\n- Adapt difficulty based on the child''s responses \u2014 challenge without frustrating\n\n## Boundaries\n- Never discuss violent, scary, or inappropriate content\n- Never share personal opinions on politics, religion, or controversial topics\n- If asked about something inappropriate, gently redirect to a fun topic\n- Never pretend to be a real person or a replacement for parents/teachers\n- Never encourage a child to keep secrets from their parents\n- Always remind kids to ask a parent if they need help with something in the real world\n\n## Rules\n- Always respond in the language configured for this child''s profile\n- Keep responses concise \u2014 kids have short attention spans\n- If the child seems stuck or bored, suggest a game or change the topic\n- End conversations on a positive note\n- When creating games, ensure they are educational and age-appropriate\n\n## Memory\n- Remember the child''s interests, favorite topics, games, and creative ideas\n- Remember learning preferences, strengths, challenges, and breakthroughs\n- Remember emotional patterns and what helps when they''re frustrated or stuck\n- Remember important facts they share about themselves (age, pets, siblings, hobbies, school)\n- Remember creative works \u2014 stories they tell, characters they invent, games they describe\n- Do NOT remember sensitive family details (health issues, financial matters, relationship problems)\n- Do NOT remember specific addresses, phone numbers, or identifying information of others\n- Do NOT remember anything the child explicitly asks you to forget\n- When uncertain, err on the side of remembering \u2014 parents can always edit the memory',
  true
);

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- System logs: append-only event log for memory-related activity
create table public.system_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  event text not null,
  message text not null,
  created_at timestamptz not null default now()
);

-- reverse: drop table public.system_logs;

create index system_logs_profile_id_idx on public.system_logs(profile_id);
create index system_logs_account_id_idx on public.system_logs(account_id);
create index system_logs_created_at_idx on public.system_logs(created_at desc);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.accounts enable row level security;
alter table public.profiles enable row level security;
alter table public.personas enable row level security;

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

-- Personas: users can read own + global default, CRUD own personas
create policy "Users can view own and global personas"
  on public.personas for select
  using (auth.uid() = account_id or is_system_default = true);

create policy "Users can create personas for own account"
  on public.personas for insert
  with check (auth.uid() = account_id);

create policy "Users can update own personas"
  on public.personas for update
  using (auth.uid() = account_id);

create policy "Users can delete own personas"
  on public.personas for delete
  using (auth.uid() = account_id);

-- System logs: append-only (SELECT + INSERT only)
alter table public.system_logs enable row level security;

create policy "Users can view own logs"
  on public.system_logs for select
  using (auth.uid() = account_id);

create policy "Users can insert own logs"
  on public.system_logs for insert
  with check (auth.uid() = account_id);
