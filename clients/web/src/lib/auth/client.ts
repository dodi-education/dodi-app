import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * Better Auth client for the platform (platform.dodi.app, mounted at
 * `${NEXT_PUBLIC_API_URL}/api/auth`). Sessions are bearer-only: no cookie ever
 * crosses to the API origin. The platform's bearer plugin hands the session
 * token out in the `set-auth-token` response header on every sign-in, and we
 * send it back as `Authorization: Bearer …` on every auth, platform and
 * dodi AI request.
 *
 * The token lives in localStorage (the client's source of truth) and is
 * mirrored into the first-party `dodi-session` cookie so the Next middleware
 * (server side, see lib/auth/middleware.ts) can gate routes without a client
 * round trip. Sign-out clears both.
 */

const TOKEN_STORAGE_KEY = "dodi-auth-token";
/** First-party mirror of the bearer for the Next middleware. */
export const SESSION_COOKIE_NAME = "dodi-session";
const SESSION_COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days, matches the server session

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** The stored bearer token, or "" when signed out (or during SSR). Synchronous. */
export function getAccessToken(): string {
  if (!isBrowser()) return "";
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

function cookieAttributes(maxAge: number): string {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  return `Path=/; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

/** Persist a freshly issued bearer (localStorage + the middleware cookie mirror). */
export function storeAccessToken(token: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // Storage blocked (private mode quota etc.): the cookie mirror still lets
    // the middleware through; API calls will ask for a fresh sign-in.
  }
  document.cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttributes(SESSION_COOKIE_MAX_AGE)}`;
}

/** Drop the bearer on this device (both the store and the cookie mirror). */
export function clearAccessToken(): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
  document.cookie = `${SESSION_COOKIE_NAME}=; ${cookieAttributes(0)}`;
}

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  plugins: [emailOTPClient()],
  fetchOptions: {
    auth: { type: "Bearer", token: () => getAccessToken() },
    // Bearer-only by design: no cookie may cross to the API origin. The client
    // otherwise defaults to `credentials: "include"`, which would make every
    // call a credentialed cross-origin request and require the API to answer
    // with `access-control-allow-credentials` (it deliberately does not), so
    // the browser would block the response before we ever see it.
    credentials: "omit",
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get("set-auth-token");
      if (token) storeAccessToken(token);
    },
  },
});

/**
 * Sign out everywhere it matters: revoke the server session (best effort; the
 * bearer may already be dead) and always drop the local token + cookie mirror.
 */
export async function signOut(): Promise<void> {
  try {
    await authClient.signOut();
  } catch {
    // The local state is what gates this device; a failed revoke only leaves a
    // session row that expires on its own.
  } finally {
    clearAccessToken();
  }
}

/** Email + id of the signed-in user, or null (one `/get-session` round trip). */
export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  const { data } = await authClient.getSession();
  const user = data?.user;
  return user ? { id: user.id, email: user.email } : null;
}
