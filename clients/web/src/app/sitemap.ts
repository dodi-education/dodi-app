import type { MetadataRoute } from "next";

import { getSitemapGames } from "@/lib/public-games";

/**
 * The app's only indexable pages are the public game pages (plus the auth
 * entry points listed in robots.ts). One URL per game — the language is
 * content-negotiated on the same URL, so there are no per-locale alternates.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app"
  ).replace(/\/+$/, "");
  const games = await getSitemapGames();
  return games.map((game) => ({
    url: `${appUrl}/games/${game.id}`,
    lastModified: game.updated_at,
    changeFrequency: "weekly",
  }));
}
