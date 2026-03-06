-- Drop transcript_checkpoints table (replaced by localStorage-based persistence)
-- reverse: see migration 20260228120000 for original CREATE TABLE

drop policy if exists "Users can insert own checkpoints" on transcript_checkpoints;
drop policy if exists "Users can read own checkpoints" on transcript_checkpoints;
drop policy if exists "Users can delete own checkpoints" on transcript_checkpoints;
drop table if exists transcript_checkpoints;
