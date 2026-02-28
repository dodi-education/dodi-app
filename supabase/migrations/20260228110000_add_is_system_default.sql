-- Add is_system_default column to personas for defense-in-depth identification
-- of the global default persona (previously identified solely by account_id IS NULL)

-- reverse: alter table public.personas drop column is_system_default;

alter table public.personas
  add column is_system_default boolean not null default false;

-- Set the global default (the one with account_id NULL)
update public.personas
  set is_system_default = true
  where account_id is null;

-- Ensure only one system default can ever exist
create unique index personas_one_system_default
  on public.personas (is_system_default)
  where (is_system_default = true);

-- Update SELECT policy: only the true system default (not orphaned rows) is globally readable
drop policy if exists "Users can view own and global personas" on public.personas;
create policy "Users can view own and global personas"
  on public.personas for select
  using (auth.uid() = account_id or is_system_default = true);
