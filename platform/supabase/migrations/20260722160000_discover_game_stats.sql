-- Discover catalog stats: per-game play & copy counts for a set of published
-- games, aggregated server-side in a single round trip.
--
--   plays  = game_plays rows pointing at the game. Discover is play-in-place, so
--            every family's plays aggregate on the single published row — this is
--            the true cross-family total.
--   copies = the private remixes that point back at the game via source_game_id.
--            Publication FORKS also carry source_game_id, but they point at the
--            PRIVATE original, never at a published row; the
--            publication_requested_at guard excludes them belt-and-suspenders.
--
-- It reads across every family's game_plays/games rows, so it is service-role
-- only (SECURITY DEFINER + REVOKE from anon/authenticated), like the rest of
-- services/discover. Returns exactly one row per input id, including zeros.

-- forward:

-- The copies count scans games by source_game_id; index those derivative
-- lookups (partial — only rows that ARE derivatives carry a source).
CREATE INDEX IF NOT EXISTS "games_source_game_idx"
  ON "public"."games" USING "btree" ("source_game_id")
  WHERE ("source_game_id" IS NOT NULL);

CREATE OR REPLACE FUNCTION "public"."discover_game_stats"("p_game_ids" "uuid"[])
  RETURNS TABLE("game_id" "uuid", "plays" bigint, "copies" bigint)
  LANGUAGE "sql" STABLE SECURITY DEFINER
  SET "search_path" TO 'public', 'pg_temp'
  AS $$
    select
      g.id as game_id,
      (select count(*) from public.game_plays p where p.game_id = g.id) as plays,
      (select count(*) from public.games c
         where c.source_game_id = g.id
           and c.publication_requested_at is null) as copies
    from unnest(p_game_ids) as g(id);
  $$;

-- The ALTER DEFAULT PRIVILEGES in this project grants EXECUTE to
-- anon/authenticated, so revoke it explicitly — only the service role (which the
-- Discover route calls it through) may read across families.
REVOKE ALL ON FUNCTION "public"."discover_game_stats"("p_game_ids" "uuid"[]) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."discover_game_stats"("p_game_ids" "uuid"[]) TO "service_role";

-- reverse:
-- DROP FUNCTION IF EXISTS "public"."discover_game_stats"("uuid"[]);
-- DROP INDEX IF EXISTS "games_source_game_idx";
