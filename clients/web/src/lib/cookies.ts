/**
 * Tiny client-side cookie helpers. Used for non-sensitive UI state that the
 * browser needs to read synchronously (e.g. the active kid). Server
 * auth still lives in the Supabase session cookie, not here.
 */

/** Read a cookie value by name (client-only; returns null during SSR). */
export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/** Write a cookie (path `/`, 24h max-age) — matches the existing kid cookies. */
export function setCookie(name: string, value: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=${value}; path=/; max-age=86400`;
}
