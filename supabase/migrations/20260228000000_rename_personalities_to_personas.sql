-- Rename personalities table to personas
-- Also renames the FK column on profiles and all related objects

-- 1. Drop old FK constraint
alter table public.profiles
  drop constraint profiles_active_personality_id_fkey;

-- 2. Rename column on profiles
alter table public.profiles
  rename column active_personality_id to active_persona_id;

-- 3. Rename the table
alter table public.personalities rename to personas;

-- 4. Re-add FK constraint with new names
alter table public.profiles
  add constraint profiles_active_persona_id_fkey
  foreign key (active_persona_id)
  references public.personas(id)
  on delete set null;

-- 5. Rename index
alter index personalities_account_id_idx rename to personas_account_id_idx;

-- 6. Recreate trigger with new name (triggers can't be renamed)
drop trigger personalities_updated_at on public.personas;
create trigger personas_updated_at
  before update on public.personas
  for each row execute function public.handle_updated_at();

-- 7. Recreate RLS policies with new names
drop policy "Users can view own personalities" on public.personas;
drop policy "Users can create personalities for own account" on public.personas;
drop policy "Users can update own personalities" on public.personas;
drop policy "Users can delete own personalities" on public.personas;

create policy "Users can view own personas"
  on public.personas for select
  using (auth.uid() = account_id);

create policy "Users can create personas for own account"
  on public.personas for insert
  with check (auth.uid() = account_id);

create policy "Users can update own personas"
  on public.personas for update
  using (auth.uid() = account_id);

create policy "Users can delete own personas"
  on public.personas for delete
  using (auth.uid() = account_id);

-- reverse: See initial_schema.sql for original names
