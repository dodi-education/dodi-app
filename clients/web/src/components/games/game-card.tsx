"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { OfflineAwareLink } from "@/components/shared/offline-aware-link";
import { KidButton } from "@/components/kid/kid-button";
import { useOnline } from "@/hooks/use-online";
import { tagStyle } from "@/components/parent/games/tag-style";
import { useTagLabel } from "@/lib/games/tag-label";
import { GAME_TAG_IDS } from "@dodi/games/tags";
import type { Game } from "@dodi/types/database";

interface GameCardProps {
  game: Game;
  isFavorite: boolean;
  onToggleFavorite: (gameId: string, next: boolean) => void;
}

const CATALOG = new Set<string>(GAME_TAG_IDS);

export function GameCard({ game, isFavorite, onToggleFavorite }: GameCardProps) {
  const t = useTranslations("games");
  const tagLabel = useTagLabel();
  // Favorites are a server round-trip — the optimistic flip would just revert.
  const isOnline = useOnline();
  // Fallback tile is styled from the game's primary tag. Only catalog tags are
  // ever shown as chips — stray/legacy tags are filtered out.
  const style = tagStyle(game.tags[0] ?? "");
  const tags = game.tags
    .filter((tag) => CATALOG.has(tag.trim().toLowerCase()))
    .slice(0, 3);

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-[18px] pb-4 shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
      <OfflineAwareLink
        href={`/games/${game.id}`}
        className="group flex items-start gap-3.5 rounded-[16px] outline-none focus-visible:ring-2 focus-visible:ring-primary-soft-2"
      >
        {game.preview_image ? (
          <Image
            src={game.preview_image}
            alt=""
            width={100}
            height={100}
            unoptimized
            className="size-[100px] shrink-0 rounded-[16px]"
          />
        ) : (
          <div
            className="flex size-[100px] shrink-0 items-center justify-center rounded-[16px]"
            style={{ background: style.bg, color: style.fg }}
          >
            <Icon name={style.icon} size={40} stroke={1.6} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[16.5px] font-extrabold leading-tight text-ink group-hover:text-primary">
            {game.title}
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="text-[12.5px] font-bold text-faint">
              {game.is_system ? t("systemLabel") : t("customLabel")}
            </p>
            {tags.length > 0 && (
              <div className="flex items-center gap-1">
                {tags.map((raw) => {
                  const tag = raw.trim().toLowerCase();
                  const ts = tagStyle(tag);
                  const label = tagLabel(tag);
                  return (
                    <span
                      key={tag}
                      role="img"
                      aria-label={label}
                      title={label}
                      className="flex size-[18px] items-center justify-center rounded-md"
                      style={{ background: ts.bg, color: ts.fg }}
                    >
                      <Icon name={ts.icon} size={13} stroke={2} />
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <p className="mt-1.5 line-clamp-2 text-[13.5px] font-semibold leading-snug text-muted-foreground">
            {game.description}
          </p>
        </div>
      </OfflineAwareLink>

      <div className="mt-auto flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onToggleFavorite(game.id, !isFavorite)}
          disabled={!isOnline}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? t("removeFavorite") : t("addFavorite")}
          className="flex size-11 items-center justify-center rounded-full text-danger transition-colors hover:bg-danger-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 disabled:opacity-40"
        >
          <Icon name={isFavorite ? "heart_filled" : "heart"} size={22} stroke={2} />
        </button>
        <KidButton asChild size="sm" className="px-6">
          <OfflineAwareLink href={`/games/${game.id}`}>
            <Icon name="play" size={13} />
            {t("playAction")}
          </OfflineAwareLink>
        </KidButton>
      </div>
    </div>
  );
}
