-- games.source_game_version_id: which build of the private game a publication
-- copy was forked from.
--
-- The publish dialog tells a parent whether they changed their game since
-- submitting it ("Discover will show the version you submitted"). games.updated_at
-- cannot answer that: its trigger fires on every update, including toggling
-- is_active or editing tags. The source's current_game_version_id only moves
-- when the code changes (a new build, a manual save, a version restore), so
-- the client compares it against this stamp. The translate step overwrites the
-- head version in place (create_version: false), so it does not trip the hint.
--
-- Set only on publication copies, at submit time. NULL on every other row, on
-- copies submitted before this column existed, and after the version row is
-- deleted (the client then shows no hint rather than a wrong one).

ALTER TABLE public.games
  ADD COLUMN source_game_version_id uuid
    REFERENCES public.game_versions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.games.source_game_version_id IS
  'Publication copies only: the source game''s current_game_version_id when it was submitted. Lets the client tell whether the parent changed the game since. NULL elsewhere.';

-- reverse:
-- ALTER TABLE public.games DROP COLUMN source_game_version_id;
