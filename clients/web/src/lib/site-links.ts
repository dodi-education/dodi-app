/**
 * Absolute, locale-aware links from the app to the marketing site (dodi.app).
 * The landing is a separate static deployment (dodi-com/landing); its route
 * registry localizes German slugs, mirrored here for the public game page's
 * header, intro card and footer. English is unprefixed, German lives under /de.
 */
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://dodi.app").replace(
  /\/+$/,
  "",
);

/** Public source repository — mirrors the landing footer's GitHub link. */
export const GITHUB_URL = "https://github.com/dodi-education/dodi-app";

export type SitePage =
  | "home"
  | "app"
  | "companion"
  | "pricing"
  | "about"
  | "games";

const SITE_PATHS: Record<SitePage, { en: string; de: string }> = {
  home: { en: "/", de: "/de" },
  app: { en: "/app", de: "/de/app" },
  companion: { en: "/companion", de: "/de/companion" },
  pricing: { en: "/pricing", de: "/de/preise" },
  about: { en: "/about", de: "/de/ueber-uns" },
  games: { en: "/learning-games-for-kids", de: "/de/lernspiele-fuer-kinder" },
};

/** Absolute marketing-site URL for a page in the visitor's locale. */
export function siteUrl(page: SitePage, locale: string, hash = ""): string {
  const paths = SITE_PATHS[page];
  const path = locale === "de" ? paths.de : paths.en;
  return `${SITE_URL}${path}${hash}`;
}
