-- Offline play sync: activities gain an occurred_at distinct from created_at.
-- A game event recorded offline reaches the server minutes or days later;
-- created_at then reflects the sync moment, occurred_at the actual gameplay
-- moment. The parent insights feed orders by occurred_at.

alter table public.activities
  add column occurred_at timestamptz not null default now();

update public.activities
  set occurred_at = created_at;

create index activities_account_id_occurred_at_idx
  on public.activities (account_id, occurred_at desc);

-- reverse:
-- drop index if exists public.activities_account_id_occurred_at_idx;
-- alter table public.activities drop column if exists occurred_at;
