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
