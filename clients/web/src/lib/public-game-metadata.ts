import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import {
  appOrigin,
  publicGameLanguageAlternates,
  publicGamePreviewImageUrl,
} from "@/lib/public-game-urls";
import type { DiscoverGameDetail } from "@dodi/types/games";

/** Trim to a metadata-friendly length on a word boundary. */
function metaDescription(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= 160) return clean;
  return `${clean.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}

/**
 * Shared metadata for the public game page variants. `canonicalPath` differs
 * per route: the unprefixed page keeps its stable /games/[id] canonical, the
 * locale-prefixed variants canonicalize per {@link publicGamePath} (default
 * locale dedupes onto the unprefixed URL). All variants share one hreflang
 * set, so crawlers see every language from any entry point.
 */
export async function publicGameMetadata(
  game: DiscoverGameDetail,
  locale: string,
  canonicalPath: string,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "publicGames" });
  const title = `${game.title}: ${t("metaTitleSuffix")}`;
  const description = metaDescription(game.description);
  const canonical = `${appOrigin()}${canonicalPath}`;
  // The small square preview: link previews render it as a thumbnail card.
  const previewUrl = publicGamePreviewImageUrl(game);

  return {
    title,
    description,
    alternates: {
      canonical,
      languages: publicGameLanguageAlternates(game.id),
    },
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      siteName: "dodi",
      url: canonical,
      title,
      description,
      locale,
      ...(previewUrl ? { images: [{ url: previewUrl, alt: game.title }] } : {}),
    },
    twitter: {
      card: "summary",
      title,
      description,
      ...(previewUrl ? { images: [previewUrl] } : {}),
    },
  };
}
