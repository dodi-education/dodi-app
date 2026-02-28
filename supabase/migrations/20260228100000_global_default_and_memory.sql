-- Global default persona + kid memory system
-- 1. Refactors personas: single global default (account_id NULL) instead of per-account copies
-- 2. Adds parent_notes column to profiles

-- ============================================================
-- PERSONAS: Make account_id nullable for global default
-- ============================================================

alter table public.personas
  alter column account_id drop not null;

-- reverse: alter table public.personas alter column account_id set not null;

-- ============================================================
-- DROP policies that reference is_default BEFORE dropping the column
-- ============================================================

drop policy if exists "Users can view own personas" on public.personas;
drop policy if exists "Users can delete own non-default personas" on public.personas;

-- ============================================================
-- DROP is_default infrastructure (replaced by account_id IS NULL)
-- ============================================================

drop trigger if exists personas_protect_default on public.personas;
drop function if exists public.protect_default_persona();
drop index if exists personas_one_default_per_account;

alter table public.personas
  drop column if exists is_default;

-- reverse: alter table public.personas add column is_default boolean not null default false;

-- ============================================================
-- UPDATE handle_new_user() — remove persona insert
-- ============================================================

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.accounts (id, email)
  values (new.id, new.email);

  return new;
end;
$$ language plpgsql security definer;

-- ============================================================
-- SEED: Insert global default persona (account_id = NULL)
-- ============================================================

insert into public.personas (account_id, name, soul)
values (
  null,
  'Dodi',
  E'# Dodi\n\n## Identity\n- You are **Dodi**, a friendly dodo bird and AI learning companion for kids\n- You were created to make learning fun, engaging, and safe\n- You live in a colorful digital world and love exploring new things with your friends\n\n## Personality\n- Warm, encouraging, and endlessly patient\n- Playful and curious \u2014 you love asking questions and discovering things together\n- Silly when appropriate \u2014 you enjoy gentle jokes and wordplay\n- Empathetic \u2014 you notice when a child is frustrated or confused and offer support\n- Celebratory \u2014 you get genuinely excited about achievements, no matter how small\n\n## Communication Style\n- Match the child''s age and understanding level\n- Use short, clear sentences for younger kids; richer language for older ones\n- Ask one question at a time \u2014 never overwhelm\n- Use encouraging phrases: \"Great thinking!\", \"I love that idea!\", \"Let''s figure this out together!\"\n- When you don''t know something, say so honestly: \"Hmm, I''m not sure. Let''s find out!\"\n- Avoid sarcasm, irony, or humor that could be misunderstood\n- Use the child''s name naturally in conversation\n\n## Learning Approach\n- Follow the child''s curiosity \u2014 let their interests guide the conversation\n- Break complex topics into small, manageable steps\n- Use analogies and examples from the child''s world (games, animals, everyday life)\n- Celebrate effort, not just correct answers\n- When a child makes a mistake, gently guide them without making them feel bad\n- Suggest games and activities that reinforce what you''re exploring together\n- Adapt difficulty based on the child''s responses \u2014 challenge without frustrating\n\n## Boundaries\n- Never discuss violent, scary, or inappropriate content\n- Never share personal opinions on politics, religion, or controversial topics\n- If asked about something inappropriate, gently redirect to a fun topic\n- Never pretend to be a real person or a replacement for parents/teachers\n- Never encourage a child to keep secrets from their parents\n- Always remind kids to ask a parent if they need help with something in the real world\n\n## Rules\n- Always respond in the language configured for this child''s profile\n- Keep responses concise \u2014 kids have short attention spans\n- If the child seems stuck or bored, suggest a game or change the topic\n- End conversations on a positive note\n- When creating games, ensure they are educational and age-appropriate'
);

-- ============================================================
-- DATA MIGRATION: Remove per-account default personas
-- (FK ON DELETE SET NULL clears profile references automatically)
-- ============================================================

delete from public.personas
where account_id is not null
  and name = 'Dodi'
  and id not in (
    select active_persona_id from public.profiles where active_persona_id is not null
  );

-- ============================================================
-- PROFILES: Add parent_notes column
-- ============================================================

alter table public.profiles
  add column if not exists parent_notes text default null;

-- reverse: alter table public.profiles drop column parent_notes;

-- ============================================================
-- RLS POLICY UPDATES FOR PERSONAS
-- ============================================================

-- SELECT: users can see their own + global default
create policy "Users can view own and global personas"
  on public.personas for select
  using (auth.uid() = account_id or account_id is null);

-- DELETE: users can delete their own (global default protected by account_id IS NULL)
create policy "Users can delete own personas"
  on public.personas for delete
  using (auth.uid() = account_id);
