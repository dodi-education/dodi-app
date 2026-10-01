/**
 * Every request leaves without cookies. The platform is bearer-only, and the
 * native networking stacks keep a cookie jar: a stored session cookie riding
 * along would switch Better Auth into its cookie CSRF mode, which a native
 * request (no Origin header) fails.
 */
export const cookielessFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, credentials: "omit" });
