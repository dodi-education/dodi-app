-- Agent Sessions — persistent tracking for long-running agent tasks
-- reverse: drop table public.agent_sessions;

create table public.agent_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  task_type text not null,
  task_prompt text not null default '',
  dodi_context text not null default 'game_creation',
  status text not null default 'active',
  progress text not null default 'planning',
  result jsonb null,
  error text null,
  game_id uuid null references public.games(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz null,
  deactivated_at timestamptz null,

  constraint agent_sessions_status_check
    check (status in ('active', 'completed', 'failed', 'deactivated')),
  constraint agent_sessions_progress_check
    check (progress in ('planning', 'building', 'testing', 'done')),
  constraint agent_sessions_task_type_check
    check (task_type in ('generate_game', 'update_game'))
);

-- Indexes
create index agent_sessions_profile_status_idx
  on public.agent_sessions (profile_id, status, created_at desc);

create index agent_sessions_account_created_idx
  on public.agent_sessions (account_id, created_at desc);

-- Auto-update updated_at (function already exists from initial schema)
create trigger agent_sessions_updated_at
  before update on public.agent_sessions
  for each row execute function public.handle_updated_at();

-- Row-Level Security
alter table public.agent_sessions enable row level security;

create policy "Users can view own agent sessions"
  on public.agent_sessions for select
  using (auth.uid() = account_id);

create policy "Users can create own agent sessions"
  on public.agent_sessions for insert
  with check (auth.uid() = account_id);

create policy "Users can update own agent sessions"
  on public.agent_sessions for update
  using (auth.uid() = account_id)
  with check (auth.uid() = account_id);
