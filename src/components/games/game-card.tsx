"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Game } from "@/types/database";

interface GameCardProps {
  game: Game;
  isDeleting?: boolean;
  onDelete?: (game: Game) => void;
}

export function GameCard({
  game,
  isDeleting = false,
  onDelete,
}: GameCardProps) {
  const t = useTranslations("games");

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-dodi-800">{game.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{game.description}</p>
        </div>
        {game.is_system ? (
          <Badge variant="secondary">{t("systemLabel")}</Badge>
        ) : (
          <Badge variant="outline">{t("customLabel")}</Badge>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge variant="outline">{game.subject}</Badge>
        <Badge variant="outline">{game.difficulty}</Badge>
        <Badge variant="outline">{game.estimated_duration_minutes} min</Badge>
      </div>

      {game.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {game.tags.slice(0, 5).map((tag) => (
            <span
              key={`${game.id}-${tag}`}
              className="rounded-full bg-dodi-100 px-2 py-0.5 text-xs font-medium text-dodi-700"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/games/${game.id}`}>{t("playAction")}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/games/${game.id}/edit`}>{t("remixAction")}</Link>
        </Button>
        {!game.is_system && onDelete && (
          <Button
            variant="destructive"
            size="sm"
            disabled={isDeleting}
            onClick={() => onDelete(game)}
          >
            {t("deleteAction")}
          </Button>
        )}
      </div>
    </div>
  );
}
