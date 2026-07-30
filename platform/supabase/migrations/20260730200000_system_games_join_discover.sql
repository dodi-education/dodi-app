-- System games join dodi Discover.
--
-- System games used to be hard-wired as always-playable for every kid
-- (is_system short-circuits in the visibility checks). They now flow through
-- the regular publication pipeline instead: each is_system row is stamped as
-- published by dodi (approved_by = 'system'), which surfaces it in the
-- parent-facing Discover catalog, and kid access is governed by the family's
-- game_sharings rows like any other published game (play-in-place). New kids
-- get the system games auto-shared on creation (POST /api/kids); parents can
-- remove the share like for any other Discover game.
--
-- "Published requires review" gains the first-party exception: dodi's own
-- system rows are published by fiat (approved_by = 'system') and never carry a
-- publication_requested_at — which also keeps them invisible to the entire
-- review/queue machinery, whose queries all filter on that column.
ALTER TABLE public.games
  DROP CONSTRAINT IF EXISTS games_published_requires_review_check;
ALTER TABLE public.games
  ADD CONSTRAINT games_published_requires_review_check
    CHECK (("published_at" IS NULL)
           OR (("approved_by" IS NOT NULL)
               AND (("publication_requested_at" IS NOT NULL) OR ("is_system" = true))));

-- published_at derives from created_at with a per-row stagger so the values
-- stay unique — Discover's keyset cursor paginates on published_at.
UPDATE public.games g
SET published_at = g.created_at + make_interval(secs => ord.rn),
    approved_by = 'system'
FROM (
  SELECT id, row_number() OVER (ORDER BY system_key) AS rn
  FROM public.games
  WHERE is_system = true
) ord
WHERE g.id = ord.id
  AND g.published_at IS NULL;

-- Existing kids keep their access: backfill the per-kid sharing row every new
-- kid gets from now on, except where a family-wide row already covers the
-- account. From here on the share is the parent's to keep or remove.
INSERT INTO public.game_sharings (game_id, account_id, kid_id)
SELECT g.id, k.account_id, k.id
FROM public.games g
CROSS JOIN public.kids k
WHERE g.is_system = true
  AND NOT EXISTS (
    SELECT 1
    FROM public.game_sharings s
    WHERE s.game_id = g.id
      AND s.account_id = k.account_id
      AND s.kid_id IS NULL
  )
ON CONFLICT (game_id, kid_id) WHERE kid_id IS NOT NULL DO NOTHING;

-- reverse:
-- DELETE FROM public.game_sharings s
--   USING public.games g
--   WHERE s.game_id = g.id AND g.is_system = true;
-- UPDATE public.games SET published_at = NULL, approved_by = NULL
--   WHERE is_system = true;
-- ALTER TABLE public.games
--   DROP CONSTRAINT IF EXISTS games_published_requires_review_check;
-- ALTER TABLE public.games
--   ADD CONSTRAINT games_published_requires_review_check
--     CHECK (("published_at" IS NULL)
--            OR (("publication_requested_at" IS NOT NULL) AND ("approved_by" IS NOT NULL)));
