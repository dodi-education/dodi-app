"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";

import { Icon } from "@/components/shared/icon";
import { OfflineAwareLink } from "@/components/shared/offline-aware-link";
import { KidButton } from "@/components/kid/kid-button";
import { useOnline } from "@/hooks/use-online";
import { tagStyle } from "@/components/parent/games/tag-style";
import { useTagLabel } from "@/lib/games/tag-label";
import { cn } from "@/lib/utils";
import { kidCardTags } from "@dodi/client-state/kid-game-library";
import type { Game } from "@dodi/types/database";
import { kidCard } from "@dodi/ui-recipes";

interface GameCardProps {
  game: Game;
  isFavorite: boolean;
  onToggleFavorite: (gameId: string, next: boolean) => void;
}

export function GameCard({ game, isFavorite, onToggleFavorite }: GameCardProps) {
  const t = useTranslations("games");
  const tagLabel = useTagLabel();
  // Favorites are a server round-trip — the optimistic flip would just revert.
  const isOnline = useOnline();
  // Fallback tile is styled from the game's primary tag. Only catalog tags are
  // ever shown as chips — stray/legacy tags are filtered out.
  const style = tagStyle(game.tags[0] ?? "");
  const tags = kidCardTags(game.tags);

  return (
    <div className={cn(kidCard.web, kidCard.box)}>
      <OfflineAwareLink
        href={`/games/${game.id}`}
        className={cn(kidCard.webLink, kidCard.link)}
      >
        {game.preview_image ? (
          <Image
            src={game.preview_image}
            alt=""
            width={100}
            height={100}
            unoptimized
            className={kidCard.thumb}
          />
        ) : (
          <div
            className={cn(kidCard.webTile, kidCard.tile)}
            style={{ background: style.bg, color: style.fg }}
          >
            <Icon name={style.icon} size={40} stroke={1.6} />
          </div>
        )}
        <div className={kidCard.main}>
          <h3 className={cn(kidCard.title, kidCard.webTitle)}>
            {game.title}
          </h3>
          <div className={cn(kidCard.webMetaRow, kidCard.metaRow)}>
            <p className={kidCard.meta}>
              {game.is_system ? t("systemLabel") : t("customLabel")}
            </p>
            {tags.length > 0 && (
              <div className={cn(kidCard.webTags, kidCard.tags)}>
                {tags.map((tag) => {
                  const ts = tagStyle(tag);
                  const label = tagLabel(tag);
                  return (
                    <span
                      key={tag}
                      role="img"
                      aria-label={label}
                      title={label}
                      className={cn(kidCard.webTag, kidCard.tag)}
                      style={{ background: ts.bg, color: ts.fg }}
                    >
                      <Icon name={ts.icon} size={13} stroke={2} />
                    </span>
                  );
                })}
              </div>
            )}
          </div>
          <p className={cn(kidCard.description, kidCard.webDescription)}>
            {game.description}
          </p>
        </div>
      </OfflineAwareLink>

      <div className={cn(kidCard.webFooter, kidCard.footer)}>
        <button
          type="button"
          onClick={() => onToggleFavorite(game.id, !isFavorite)}
          disabled={!isOnline}
          aria-pressed={isFavorite}
          aria-label={isFavorite ? t("removeFavorite") : t("addFavorite")}
          className={cn(kidCard.webIconButton, kidCard.iconButton, kidCard.iconButtonText)}
        >
          <Icon name={isFavorite ? "heart_filled" : "heart"} size={22} stroke={2} />
        </button>
        <KidButton asChild size="sm" className={kidCard.play}>
          <OfflineAwareLink href={`/games/${game.id}`}>
            <Icon name="play" size={13} />
            {t("playAction")}
          </OfflineAwareLink>
        </KidButton>
      </div>
    </div>
  );
}
