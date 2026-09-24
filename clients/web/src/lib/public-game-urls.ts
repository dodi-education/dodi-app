import { defaultLocale, locales } from "@/i18n/config";

/**
 * URL scheme of the public game pages ("as-needed" locale prefix):
 * - default locale lives UNPREFIXED at /games/[id] (the historical URL),
 * - every other locale gets /{locale}/games/[id],
 * - the unprefixed URL doubles as the x-default (content-negotiated) variant.
 * Used by the pages' canonicals/hreflang, the sitemap, JSON-LD, and the
 * language switcher's prefix swap — one scheme, defined once.
 */
export function publicGamePath(id: string, locale: string): string {
  return locale === defaultLocale ? `/games/${id}` : `/${locale}/games/${id}`;
}

export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app").replace(
    /\/+$/,
    "",
  );
}

/** Absolute hreflang alternates for one public game page (incl. x-default). */
export function publicGameLanguageAlternates(id: string): Record<string, string> {
  const origin = appOrigin();
  return {
    ...Object.fromEntries(
      locales.map((locale) => [locale, `${origin}${publicGamePath(id, locale)}`]),
    ),
    "x-default": `${origin}/games/${id}`,
  };
}

/**
 * Absolute, scraper-fetchable URL of a published game's small preview image
 * (og:image, JSON-LD), or `undefined` when there is none. System games carry
 * same-origin path previews; parent publications store data URLs, which link
 * previews reject, so those point at the platform's public preview-image
 * endpoint that serves the decoded bytes. Always the PUBLIC API origin, never
 * API_URL_INTERNAL: the URL is fetched by third-party scrapers.
 */
export function publicGamePreviewImageUrl(game: {
  id: string;
  preview_image: string | null;
}): string | undefined {
  const preview = game.preview_image;
  if (!preview) return undefined;
  if (preview.startsWith("/")) return `${appOrigin()}${preview}`;
  const api = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
  if (preview.startsWith("data:image/") && api) {
    return `${api}/api/public/games/${encodeURIComponent(game.id)}/preview-image`;
  }
  return undefined;
}
