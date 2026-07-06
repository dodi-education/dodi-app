"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { PageActions, Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import {
  GameStudioList,
  type GameListItem,
} from "@/components/parent/games/game-studio-list";
import { useKids } from "@/hooks/use-kids";
import { dodi } from "@/lib/api";
import type { Game } from "@dodi/types/database";

type AccountGame = Game & {
  sharing: { family: boolean; kidIds: string[] };
};

export default function GameStudioPage() {
  const t = useTranslations("gameStudio");

  const { kids } = useKids();
  const [games, setGames] = useState<AccountGame[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    dodi
      .request("/api/games?scope=account")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: AccountGame[]) => {
        if (!cancelled) setGames(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!cancelled) setGames([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items: GameListItem[] = useMemo(() => {
    if (!games) return [];
    // Decrypted names come from the kid cache (E2EE display_name).
    const nameById = new Map((kids ?? []).map((p) => [p.id, p.display_name]));
    return games.map((g) => {
      const share = g.sharing ?? { family: false, kidIds: [] };
      // The owning kid (for kid-created games) always counts as audience.
      const audienceIds = new Set(share.kidIds);
      if (g.kid_id) audienceIds.add(g.kid_id);
      const kidNames = Array.from(audienceIds)
        .map((id) => nameById.get(id))
        .filter((name): name is string => Boolean(name));

      return {
        id: g.id,
        title: g.title,
        tags: g.tags,
        updatedAt: g.updated_at,
        isActive: g.is_active,
        isFamily: share.family,
        kidNames,
      };
    });
  }, [games, kids]);

  return (
    <div>
      <PageActions>
        <Button asChild>
          <Link href="/parent/game-studio/new">
            <Icon name="sparkles" size={16} />
            {t("addGame")}
          </Link>
        </Button>
      </PageActions>

      <Section title={t("yourGames")}>
        {games === null ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            …
          </p>
        ) : items.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            {t("noGames")}
          </p>
        ) : (
          <GameStudioList items={items} />
        )}
      </Section>
    </div>
  );
}
