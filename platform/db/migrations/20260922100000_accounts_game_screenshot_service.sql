-- accounts.game_screenshot_service: the Game Studio's screenshot-service choice.
--
-- The game agent runs in the parent's browser and cannot see what it built:
-- browser JavaScript has no way to rasterize its own rendered output. A real
-- screenshot needs a renderer outside the page, so the studio can post the
-- finished sandbox document to a screenshot service (the dodi worker behind
-- POST /api/games/screenshot, or a self-hosted one speaking the same contract)
-- and feed the frames back to the agent. That sends plaintext game code to a
-- server, which games-are-E2EE otherwise forbids, so it is a per-account
-- choice the parent sees and can switch off.
--
-- Shape: {"mode": "off" | "dodi" | "custom", "customUrlEnc"?: "enc:v1:..."}.
-- `mode` is plaintext on purpose: the platform refuses to render for accounts
-- that did not pick "dodi" (defense in depth against a buggy client). The
-- custom URL is sealed client-side under the account VMK, like
-- date_preferences.timeZoneEnc: only the browser ever calls it, so the server
-- never needs to read it. Default "dodi" so visual checks run from day one;
-- existing rows pick the default up too.

ALTER TABLE public.accounts
  ADD COLUMN game_screenshot_service jsonb NOT NULL DEFAULT '{"mode":"dodi"}'::jsonb;

COMMENT ON COLUMN public.accounts.game_screenshot_service IS
  'Game Studio visual-check setting: {"mode": "off"|"dodi"|"custom", "customUrlEnc"?: enc:v1:}. mode is plaintext (the platform enforces the opt-in for POST /api/games/screenshot); customUrlEnc is sealed client-side under the account VMK and never read by the server.';

-- reverse:
-- ALTER TABLE public.accounts DROP COLUMN game_screenshot_service;
