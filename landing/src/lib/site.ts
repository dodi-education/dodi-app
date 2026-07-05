/**
 * Static site configuration. URLs are env-driven with production fallbacks so the
 * build works without a local `.env`. The landing is decoupled from the app, so it
 * only needs to know the app's public origin to link to it (login / register).
 */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://dodi.app";
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app";

/** Public source repository — linked from the marketing site's GitHub CTAs. */
export const GITHUB_URL = "https://github.com/dodi-education/dodi-app";

export const locales = ["en", "de"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

/** The URL path each locale is served at (English unprefixed, German under /de). */
export const localePath: Record<Locale, string> = { en: "/", de: "/de" };

/**
 * Map a pathname to its equivalent under `next` locale, so switching languages
 * keeps the visitor on the same page. English pages are unprefixed and German
 * pages live under `/de`, so the mapping is just adding/removing that prefix
 * (e.g. `/about` ⇄ `/de/about`, `/` ⇄ `/de`).
 */
export function localizePath(pathname: string, next: Locale): string {
  // Strip an existing German prefix to get the locale-agnostic path.
  let bare = pathname;
  if (bare === "/de" || bare.startsWith("/de/")) bare = bare.slice(3);
  if (bare === "") bare = "/";
  if (next === "en") return bare;
  return bare === "/" ? "/de" : `/de${bare}`;
}
