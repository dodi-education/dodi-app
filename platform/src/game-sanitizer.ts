/**
 * Re-export of the shared, isomorphic game bundle sanitizer.
 *
 * The implementation lives in `@dodi/games/sanitizer` so the browser agent loop
 * can sanitize generated bundles before persisting.
 *
 * Private games are sealed client-side, so the ordinary write routes receive
 * ciphertext and CANNOT sanitize — the browser is the enforcement point there,
 * which is sound because that code only ever runs in its own author's sandbox.
 * The server-side pass survives exactly where it matters: the publication path,
 * whose submitted copy is plaintext and whose code other families will run.
 */
export {
  assertSafeGameBundle,
  sanitizeGameBundle,
  getGameBundleLimitBytes,
  type SanitizedGameBundle,
} from "@dodi/games/sanitizer";
