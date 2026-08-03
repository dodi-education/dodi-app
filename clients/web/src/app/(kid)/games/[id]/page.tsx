import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

import { GamePlayPage } from "@/components/games/game-play-page";
import { PublicGamePage } from "@/components/public/public-game-page";
import { publicGameMetadata } from "@/lib/public-game-metadata";
import { getPopularGames, getPublicGame } from "@/lib/public-games";

/**
 * /games/[id] serves two audiences from one URL:
 * - Signed-in: the unchanged client kid experience (GamePlayPage inside
 *   KidChrome). The client re-derives the id from the URL itself, so the
 *   offline detail-shell substitution keeps working.
 * - Anonymous: the server-rendered PUBLIC page for published games — the SEO
 *   inbound channel, language-negotiated (cookie/Accept-Language) and doubling
 *   as the hreflang x-default. The crawlable per-language variants live at
 *   /{locale}/games/[id] (see app/[locale]/games/[id]). Anything not published
 *   redirects to /login uniformly, so the route never reveals whether a
 *   private game exists.
 * The auth signal is the `x-dodi-authed` header stamped by middleware.
 */
interface PageProps {
  params: Promise<{ id: string }>;
}

async function isAuthed(): Promise<boolean> {
  return (await headers()).get("x-dodi-authed") === "1";
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  // Signed-in navigations keep the app's generic metadata — no platform round
  // trip, and a family game's title is E2EE anyway.
  if (await isAuthed()) return {};

  const { id } = await params;
  const locale = await getLocale();
  const game = await getPublicGame(id, locale);
  // Redirecting here (not only in the page body) keeps it an HTTP 307: by the
  // time the page component runs, the streamed shell is already flushed and a
  // redirect() there degrades to a 200 + meta refresh.
  if (!game) redirect(`/login?next=${encodeURIComponent(`/games/${id}`)}`);

  // The canonical stays the stable negotiated URL regardless of the visitor's
  // cookie locale — crawlers must always see the same canonical here.
  return publicGameMetadata(game, locale, `/games/${game.id}`);
}

export default async function GamePage({ params }: PageProps) {
  if (await isAuthed()) return <GamePlayPage />;

  const { id } = await params;
  const locale = await getLocale();
  const [game, popular] = await Promise.all([
    getPublicGame(id, locale),
    getPopularGames(locale),
  ]);
  if (!game) redirect(`/login?next=${encodeURIComponent(`/games/${id}`)}`);

  return <PublicGamePage game={game} popular={popular} locale={locale} />;
}
