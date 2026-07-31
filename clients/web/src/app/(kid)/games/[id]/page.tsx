import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";

import { GamePlayPage } from "@/components/games/game-play-page";
import { PublicGamePage } from "@/components/public/public-game-page";
import { getPopularGames, getPublicGame } from "@/lib/public-games";

/**
 * /games/[id] serves two audiences from one URL:
 * - Signed-in: the unchanged client kid experience (GamePlayPage inside
 *   KidChrome). The client re-derives the id from the URL itself, so the
 *   offline detail-shell substitution keeps working.
 * - Anonymous: the server-rendered PUBLIC page for published games — the SEO
 *   inbound channel. Anything not published redirects to /login uniformly, so
 *   the route never reveals whether a private game exists.
 * The auth signal is the `x-dodi-authed` header stamped by middleware.
 */
interface PageProps {
  params: Promise<{ id: string }>;
}

async function isAuthed(): Promise<boolean> {
  return (await headers()).get("x-dodi-authed") === "1";
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app").replace(
    /\/+$/,
    "",
  );
}

/** Trim to a metadata-friendly length on a word boundary. */
function metaDescription(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= 160) return clean;
  return `${clean.slice(0, 157).replace(/\s+\S*$/, "")}…`;
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

  const t = await getTranslations("publicGames");
  const title = `${game.title}: ${t("metaTitleSuffix")}`;
  const description = metaDescription(game.description);
  const canonical = `${appUrl()}/games/${game.id}`;
  // Only system games carry same-origin path previews; parent publications
  // store data URLs, which OG scrapers reject — those pages go without image.
  const previewUrl = game.preview_image?.startsWith("/")
    ? `${appUrl()}${game.preview_image}`
    : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: "dodi",
      url: canonical,
      title,
      description,
      locale,
      ...(previewUrl ? { images: [{ url: previewUrl }] } : {}),
    },
  };
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
