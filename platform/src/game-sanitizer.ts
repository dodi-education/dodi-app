/**
 * Re-export of the shared, isomorphic game bundle sanitizer.
 *
 * The implementation lives in `@dodi/games/sanitizer` so the browser agent loop
 * can sanitize generated bundles before persisting, while the games write routes
 * keep sanitizing server-side (defense-in-depth).
 */
export {
  assertSafeGameBundle,
  sanitizeGameBundle,
  getGameBundleLimitBytes,
  type SanitizedGameBundle,
} from "@dodi/games/sanitizer";
