import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { tagStyle } from "@/components/parent/games/tag-style";
import type { DiscoverGameDetail } from "@dodi/types/games";

/**
 * Game description card in the public game page's sidebar, under the dodi
 * intro card: byline (publisher handle, or dodi for system games), target
 * age, tag icons and the full game description. Server rendered so the
 * description stays part of the SEO HTML after it moved out of the title bar.
 */
export function GameAboutCard({ game }: { game: DiscoverGameDetail }) {
  const t = useTranslations("publicGames");
  const tTags = useTranslations("tags");

  const author = game.is_system
    ? t("bylineDodi")
    : game.publication_handle
      ? `@${game.publication_handle}`
      : null;

  return (
    <section className="rounded-[20px] bg-white p-[18px] shadow-card">
      <h2 className="font-kid text-lg font-extrabold text-ink">
        {t("aboutTitle")}
      </h2>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {author ? (
          <>
            <span className="text-sm font-bold text-ink">{author}</span>
            <span aria-hidden className="text-muted-foreground">
              ·
            </span>
          </>
        ) : null}
        <span className="rounded-full border border-border-strong px-2.5 py-0.5 text-xs font-semibold text-ink-2">
          {t("ageFrom", { age: game.target_age_min })}
        </span>
        {game.tags.map((raw) => {
          const tag = raw.trim().toLowerCase();
          if (!tag) return null;
          const style = tagStyle(tag);
          const label = tTags.has(tag) ? tTags(tag) : tag;
          return (
            <span
              key={tag}
              role="img"
              aria-label={label}
              title={label}
              className="flex size-6 shrink-0 items-center justify-center rounded-full"
              style={{ background: style.bg, color: style.fg }}
            >
              <Icon name={style.icon} size={14} />
            </span>
          );
        })}
      </div>
      <p className="mt-4 border-t border-border pt-4 text-sm font-semibold leading-relaxed text-ink-2">
        {game.description}
      </p>
    </section>
  );
}
