import { cache } from "react";

import type {
  DiscoverGameDetail,
  PublicGameSummary,
  PublishedSitemapEntry,
} from "@dodi/types/games";

/**
 * Server-side fetch helpers for the platform's PUBLIC (no-auth) game endpoints,
 * used by the anonymous /games/[id] page and the SEO surfaces (sitemap).
 * Server components only — the browser talks to the platform through
 * lib/api.ts (DodiClient + bearer) instead.
 *
 * Base URL: `API_URL_INTERNAL` when set, else `NEXT_PUBLIC_API_URL`. The
 * override exists for dev, where the platform runs on a self-signed LAN cert
 * (https://192.168.x.x:3001) that Node's fetch rejects — point
 * API_URL_INTERNAL at http://localhost:3001 for the server-side leg.
 */
function apiBase(): string {
  const base = process.env.API_URL_INTERNAL ?? process.env.NEXT_PUBLIC_API_URL;
  if (!base) {
    throw new Error(
      "public-games: set NEXT_PUBLIC_API_URL (or API_URL_INTERNAL) so server components can reach the platform API",
    );
  }
  return base.replace(/\/+$/, "");
}

/**
 * One LIVE published game, localized. `null` only for the uniform 404
 * (nonexistent, unpublished or malformed id) — transient platform failures
 * throw instead, so an outage renders an error page rather than teaching
 * crawlers that the URL redirects to /login. React cache() dedupes the
 * page + generateMetadata calls within one request.
 */
export const getPublicGame = cache(
  async (id: string, locale: string): Promise<DiscoverGameDetail | null> => {
    const res = await fetch(
      `${apiBase()}/api/public/games/${encodeURIComponent(id)}?locale=${encodeURIComponent(locale)}`,
      { cache: "no-store" },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`public-games: game fetch failed with ${res.status}`);
    }
    return (await res.json()) as DiscoverGameDetail;
  },
);

/** Up to `limit` random published games; degrades to [] so the rail just hides. */
export async function getPopularGames(
  locale: string,
  limit = 10,
): Promise<PublicGameSummary[]> {
  try {
    const res = await fetch(
      `${apiBase()}/api/public/games/popular?limit=${limit}&locale=${encodeURIComponent(locale)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { games: PublicGameSummary[] };
    return body.games ?? [];
  } catch {
    return [];
  }
}

/** Published game ids + timestamps for /sitemap.xml; degrades to []. */
export async function getSitemapGames(): Promise<PublishedSitemapEntry[]> {
  try {
    const res = await fetch(`${apiBase()}/api/public/games`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { games: PublishedSitemapEntry[] };
    return body.games ?? [];
  } catch {
    return [];
  }
}
