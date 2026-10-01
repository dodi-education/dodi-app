/**
 * The parent's UI language, applied in one place: a per-device cookie (what the
 * server-side locale resolver reads) plus a best-effort account PATCH so the
 * choice follows them to their other devices. Shared by the top-bar switcher
 * and the onboarding step; callers refresh the router afterwards so the intl
 * provider in the cached root layout re-renders in the new language.
 */
import { type Locale } from "@/i18n/config";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";
import { persistLanguage } from "@dodi/client-state/onboarding";

/** Native language names, for pickers with room for a full label. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  de: "Deutsch",
};

export function setLocaleCookie(locale: Locale): void {
  document.cookie = `NEXT_LOCALE=${locale}; path=/; max-age=31536000`;
}

/**
 * Persist the choice on the account. On public pages there's no session, so the
 * request 401s: we swallow that and keep the cookie-only behaviour.
 */
export function persistLocale(locale: Locale): void {
  // Mirrors into the shared account cache on success (no-op when signed out).
  void persistLanguage({ api: dodi, account: clientState.account }, locale);
}

/** Cookie + account: the full effect of "the parent picked a language". */
export function applyLocale(locale: Locale): void {
  setLocaleCookie(locale);
  persistLocale(locale);
}
