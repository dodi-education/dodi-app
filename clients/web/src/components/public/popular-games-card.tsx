import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { tagStyle } from "@/components/parent/games/tag-style";
import { publicGamePath } from "@/lib/public-game-urls";
import { siteUrl } from "@/lib/site-links";
import type { PublicGameSummary } from "@dodi/types/games";

/**
 * "Popular games" rail on the public game page: a random slice of the
 * published catalog, each row deep-linking to that game's own public page.
 * "All" leads to the marketing site's games catalog. Hidden when the feed is
 * empty (e.g. the platform was unreachable).
 */
export function PopularGamesCard({
  games,
  locale,
}: {
  games: PublicGameSummary[];
  locale: string;
}) {
  const t = useTranslations("publicGames");
  if (games.length === 0) return null;

  return (
    <section className="rounded-[20px] bg-white p-[18px] shadow-card">
      <div className="flex items-baseline justify-between">
        <h2 className="font-kid text-lg font-extrabold text-ink">
          {t("popularTitle")}
        </h2>
        <a
          href={siteUrl("games", locale)}
          className="text-sm font-semibold text-primary transition-colors hover:text-primary-hover"
        >
          {t("popularAll")}
        </a>
      </div>
      {/* The row links overhang by -mx-1 for their hover background; the list
          carries matching -mx-1/px-1 so that overhang lands in its own padding
          instead of creating horizontal overflow (this is a scroll container,
          which would otherwise show an x scrollbar). */}
      <ul className="-mx-1 mt-2 flex max-h-[380px] flex-col overflow-y-auto px-1">
        {games.map((game) => {
          const style = tagStyle(game.tags[0] ?? "");
          return (
            <li
              key={game.id}
              className="border-b border-border last:border-0"
            >
              <Link
                // Same-language linking: from a /de page every rail row leads
                // to the /de variant, so crawlers stay inside one language.
                href={publicGamePath(game.id, locale)}
                className="-mx-1 flex items-start gap-3 rounded-lg px-1 py-3 transition-colors outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-primary-soft-2"
              >
                {game.preview_image ? (
                  <Image
                    src={game.preview_image}
                    alt=""
                    width={52}
                    height={52}
                    unoptimized
                    className="size-13 shrink-0 rounded-xl object-cover"
                  />
                ) : (
                  <span
                    className="flex size-13 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: style.bg, color: style.fg }}
                  >
                    <Icon name={style.icon} size={26} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink">
                    {game.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {game.is_system
                      ? t("bylineSystem")
                      : game.publication_handle
                        ? `@${game.publication_handle}`
                        : null}
                    {(game.is_system || game.publication_handle) && " · "}
                    {t("ageFrom", { age: game.target_age_min })}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-muted-foreground">
                    {game.description}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
