-- Transcript checkpoints: crash resilience for voice sessions.
-- One row per profile (latest wins via upsert).
-- reverse: drop table public.transcript_checkpoints;

create table public.transcript_checkpoints (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  transcript text not null,
  session_started_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.transcript_checkpoints enable row level security;

create policy "Users can view own checkpoints"
  on public.transcript_checkpoints for select
  using (auth.uid() = account_id);

create policy "Users can create own checkpoints"
  on public.transcript_checkpoints for insert
  with check (auth.uid() = account_id);

create policy "Users can update own checkpoints"
  on public.transcript_checkpoints for update
  using (auth.uid() = account_id);

create policy "Users can delete own checkpoints"
  on public.transcript_checkpoints for delete
  using (auth.uid() = account_id);

-- System logs: append-only event log for memory-related activity.
-- reverse: drop table public.system_logs;

create table public.system_logs (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  persona_id uuid references public.personas(id) on delete set null,
  event text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index system_logs_profile_id_idx on public.system_logs(profile_id);
create index system_logs_account_id_idx on public.system_logs(account_id);
create index system_logs_created_at_idx on public.system_logs(created_at desc);

alter table public.system_logs enable row level security;

-- Append-only: SELECT + INSERT only for own account (no UPDATE/DELETE)
create policy "Users can view own logs"
  on public.system_logs for select
  using (auth.uid() = account_id);

create policy "Users can insert own logs"
  on public.system_logs for insert
  with check (auth.uid() = account_id);
