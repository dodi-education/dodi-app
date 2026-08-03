import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { PublicGamePage } from "@/components/public/public-game-page";
import { publicGameMetadata } from "@/lib/public-game-metadata";
import { publicGamePath } from "@/lib/public-game-urls";
import { getPopularGames, getPublicGame } from "@/lib/public-games";
import { isSupportedLocale } from "@dodi/intl/locales";

/**
 * /{locale}/games/[id] — the crawlable per-language variant of the public game
 * page, so search engines index every platform language (the negotiated
 * /games/[id] can only ever show them one). The URL prefix outranks all locale
 * cookies (see i18n/resolve-locale), so the full request i18n context follows
 * the URL. Default-locale URLs canonicalize onto the unprefixed page; all
 * variants share one hreflang set. Signed-in visitors are bounced to the
 * unprefixed app URL — the app itself never uses locale prefixes.
 */
interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

async function isAuthed(): Promise<boolean> {
  return (await headers()).get("x-dodi-authed") === "1";
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale, id } = await params;
  if (!isSupportedLocale(locale)) return {};
  if (await isAuthed()) return {};

  const game = await getPublicGame(id, locale);
  if (!game) redirect(`/login?next=${encodeURIComponent(`/games/${id}`)}`);

  return publicGameMetadata(game, locale, publicGamePath(game.id, locale));
}

export default async function LocalizedGamePage({ params }: PageProps) {
  const { locale, id } = await params;
  if (!isSupportedLocale(locale)) notFound();
  if (await isAuthed()) redirect(`/games/${id}`);

  const [game, popular] = await Promise.all([
    getPublicGame(id, locale),
    getPopularGames(locale),
  ]);
  if (!game) redirect(`/login?next=${encodeURIComponent(`/games/${id}`)}`);

  return <PublicGamePage game={game} popular={popular} locale={locale} />;
}
