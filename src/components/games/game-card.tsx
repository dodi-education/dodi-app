"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import { tagStyle } from "@/components/parent/games/tag-style";
import type { Game } from "@/types/database";

interface GameCardProps {
  game: Game;
}

export function GameCard({ game }: GameCardProps) {
  const t = useTranslations("games");
  // Style the tile from the game's primary tag; render up to three tag chips.
  const style = tagStyle(game.tags[0] ?? "");

  return (
    <div className="flex flex-col gap-2.5 rounded-[20px] bg-white p-[18px] pb-4 shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
      <div className="flex items-center gap-3">
        <div
          className="flex size-[46px] shrink-0 items-center justify-center rounded-[14px]"
          style={{ background: style.bg, color: style.fg }}
        >
          <Icon name={style.icon} size={24} stroke={1.7} />
        </div>
        <div className="min-w-0">
          <h3 className="text-[16.5px] font-extrabold leading-tight text-ink">
            {game.title}
          </h3>
          <p className="mt-0.5 text-[12.5px] font-bold text-faint">
            {game.is_system ? t("systemLabel") : t("customLabel")}
          </p>
        </div>
      </div>

      <p className="line-clamp-2 text-[13.5px] font-semibold leading-snug text-muted-foreground">
        {game.description}
      </p>

      <div className="flex flex-wrap gap-1.5">
        {game.tags.slice(0, 3).map((tag) => {
          const ts = tagStyle(tag);
          return (
            <span
              key={tag}
              className="rounded-full px-2.5 py-0.5 text-[11.5px] font-extrabold capitalize"
              style={{ background: ts.bg, color: ts.fg }}
            >
              {tag}
            </span>
          );
        })}
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[11.5px] font-extrabold text-muted-foreground">
          {game.estimated_duration_minutes} min
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <KidButton asChild size="sm" className="px-6">
          <Link href={`/games/${game.id}`}>
            <Icon name="play" size={13} />
            {t("playAction")}
          </Link>
        </KidButton>
      </div>
    </div>
  );
}
