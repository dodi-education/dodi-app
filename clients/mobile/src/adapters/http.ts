/**
 * Every request leaves without cookies. The platform is bearer-only, and the
 * native networking stacks keep a cookie jar: a stored session cookie riding
 * along would switch Better Auth into its cookie CSRF mode, which a native
 * request (no Origin header) fails.
 *
 * A network-level failure rejects with a `TypeError`, as a browser's fetch
 * does. The global fetch is expo/fetch (src/polyfills.ts), which rejects with
 * its own `FetchError`; the shared stores read `TypeError` as "unreachable"
 * and fall back to the offline cache, park autosaves and queue plays. Aborts
 * keep their own error.
 */
export const cookielessFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, { ...init, credentials: "omit" });
  } catch (error) {
    throw asNetworkError(error, init?.signal);
  }
};

function asNetworkError(error: unknown, signal: AbortSignal | null | undefined): unknown {
  if (error instanceof TypeError || signal?.aborted) return error;
  const message = error instanceof Error ? error.message : String(error);
  const networkError = new TypeError(message);
  // Set after construction: not every Hermes build takes the `cause` option.
  (networkError as { cause?: unknown }).cause = error;
  return networkError;
}
