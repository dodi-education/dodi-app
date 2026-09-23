-- account_rate_limit_windows: per-account fixed-window counters for expensive
-- calls (first user: POST /api/games/screenshot, which spends a headless
-- browser render per request).
--
-- One row per (account, bucket, window start); a single atomic
-- INSERT ... ON CONFLICT DO UPDATE ... RETURNING both counts the call and
-- answers whether it is over the limit, so concurrent requests cannot slip
-- past the cap (services/rate-limits.ts). Durable across platform restarts,
-- unlike an in-process map. Volume is about one row per account per active
-- hour; pruning old windows is a follow-up (scheduler).
--
-- Service-role only: the platform counts on behalf of the resolved account
-- with serviceDb, so dodi_app gets no access at all (RLS on, no policies, and
-- the default-privilege grant revoked).

CREATE TABLE public.account_rate_limit_windows (
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, bucket, window_start)
);

COMMENT ON TABLE public.account_rate_limit_windows IS
  'Per-account fixed-window request counters for rate-limited endpoints (bucket = endpoint name). Written only through serviceDb; see platform/src/services/rate-limits.ts.';
COMMENT ON COLUMN public.account_rate_limit_windows.bucket IS
  'Which limited operation the row counts, e.g. game_screenshot.';
COMMENT ON COLUMN public.account_rate_limit_windows.window_start IS
  'Start of the fixed window (now floored to the window length).';

ALTER TABLE public.account_rate_limit_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_rate_limit_windows FROM dodi_app;

-- reverse:
-- DROP TABLE public.account_rate_limit_windows;
