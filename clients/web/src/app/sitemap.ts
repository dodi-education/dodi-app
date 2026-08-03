import type { MetadataRoute } from "next";

import { locales } from "@/i18n/config";
import {
  appOrigin,
  publicGameLanguageAlternates,
  publicGamePath,
} from "@/lib/public-game-urls";
import { getSitemapGames } from "@/lib/public-games";

/**
 * The app's only indexable pages are the public game pages (plus the auth
 * entry points listed in robots.ts). One URL per game per platform language —
 * the default locale unprefixed (/games/[id]), others prefixed
 * (/{locale}/games/[id]) — each entry carrying the shared hreflang set so
 * crawlers connect the variants from any of them.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = appOrigin();
  const games = await getSitemapGames();
  return games.flatMap((game) => {
    const languages = publicGameLanguageAlternates(game.id);
    return locales.map((locale) => ({
      url: `${origin}${publicGamePath(game.id, locale)}`,
      lastModified: game.updated_at,
      changeFrequency: "weekly" as const,
      alternates: { languages },
    }));
  });
}
