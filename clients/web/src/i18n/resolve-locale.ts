import { defaultLocale, locales, type Locale } from "./config";

function isLocale(value: string | null | undefined): value is Locale {
  return value != null && locales.includes(value as Locale);
}

function parseAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const lang = part.split(";")[0].trim().split("-")[0].toLowerCase();
    if (locales.includes(lang as Locale)) {
      return lang as Locale;
    }
  }
  return null;
}

/** Everything the locale resolver needs, read from the incoming request. */
export interface LocaleSignals {
  /** Request path (from the `x-pathname` header set in middleware). */
  pathname: string | null;
  /** `dodi-view` cookie — "kid" while the kid app is active. */
  view: string | undefined;
  /** `dodi-kid-locale` cookie — the active kid's language. */
  kidLocale: string | undefined;
  /** `NEXT_LOCALE` cookie — the parent's chosen UI language. */
  userLocale: string | undefined;
  /** `accept-language` request header. */
  acceptLanguage: string | null;
}

/**
 * Decide the UI locale for a request.
 *
 * Precedence: kid-view kid language → explicit user preference
 * (`NEXT_LOCALE`) → `Accept-Language` → default.
 */
export function resolveLocale(signals: LocaleSignals): Locale {
  // The parent area always uses the parent's own UI language. We decide this
  // from the actual request path rather than the `dodi-view` cookie, which can
  // go stale (it only flips back to "parent" via the in-app switch link, so a
  // leftover "kid" value would otherwise shadow the parent's choice here).
  const inParentView = (signals.pathname ?? "").startsWith("/parent");

  // 1. Kid view: use the active kid's language (kid routes only).
  if (!inParentView && signals.view === "kid" && isLocale(signals.kidLocale)) {
    return signals.kidLocale;
  }

  // 2. Explicit user preference (NEXT_LOCALE cookie).
  if (isLocale(signals.userLocale)) {
    return signals.userLocale;
  }

  // 3. Accept-Language header.
  const detected = parseAcceptLanguage(signals.acceptLanguage);
  if (detected) {
    return detected;
  }

  // 4. Default.
  return defaultLocale;
}
