/**
 * Active-kid resolution shared by the kid layout, home page, and switcher.
 *
 * The active kid is persisted in the `dodi-active-kid` cookie (with the kid's
 * language in `dodi-kid-locale` and `dodi-view=kid` so the server resolves the
 * kid's UI locale — see i18n/resolve-locale.ts). The cookie is primed
 * server-side in middleware on a cold entry, but these helpers let the client
 * self-heal a stale cookie and drive the reactive store.
 */
import type { Kid } from "@dodi/types/database";

import { getCookie, setCookie } from "./cookies";

export const ACTIVE_KID_COOKIE = "dodi-active-kid";
export const KID_LOCALE_COOKIE = "dodi-kid-locale";
export const VIEW_COOKIE = "dodi-view";

/**
 * Pick the active kid id: keep the cookie's kid while it still exists, otherwise
 * fall back to the first (oldest) profile — the same rule the parent→kid switch
 * uses. Returns null only when the account has no kids.
 */
export function pickActiveKidId(
  kids: Kid[],
  cookieId: string | null,
): string | null {
  if (cookieId && kids.some((k) => k.id === cookieId)) return cookieId;
  return kids[0]?.id ?? null;
}

/**
 * A profile needs its avatar-PIN puzzle solved before dodi initializes, unless
 * it has already been unlocked this page-load (`unlocked`). A hard refresh
 * clears the in-memory unlocked set, so a locked profile re-prompts.
 */
export function computeNeedsPin(
  kid: Kid | null | undefined,
  unlocked: ReadonlySet<string>,
): boolean {
  return !!kid?.avatar_pin && !unlocked.has(kid.id);
}

/** Read the active-kid cookie (client only; null during SSR). */
export function readActiveKidCookie(): string | null {
  return getCookie(ACTIVE_KID_COOKIE);
}

/**
 * Persist the active kid + language for the server (locale) and reloads. Mirrors
 * the cookies middleware sets on a cold entry so client and server agree.
 */
export function writeActiveKidCookies(kid: Pick<Kid, "id" | "language">): void {
  setCookie(ACTIVE_KID_COOKIE, kid.id);
  setCookie(KID_LOCALE_COOKIE, kid.language ?? "en");
  setCookie(VIEW_COOKIE, "kid");
}
