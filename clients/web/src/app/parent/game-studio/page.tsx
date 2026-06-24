"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { PageHead, Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import {
  GameStudioList,
  type GameListItem,
} from "@/components/parent/games/game-studio-list";
import { useProfiles } from "@/hooks/use-profiles";
import { dodi } from "@/lib/api";
import type { AgentSessionRow, Game } from "@dodi/types/database";

type AccountGame = Game & {
  sharing: { family: boolean; profileIds: string[] };
};

export default function GameStudioPage() {
  const t = useTranslations("gameStudio");

  const { profiles } = useProfiles();
  const [games, setGames] = useState<AccountGame[] | null>(null);
  const [activeGameIds, setActiveGameIds] = useState<string[]>([]);

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
    dodi
      .request("/api/agent/sessions?status=active")
      .then((r) => (r.ok ? r.json() : []))
      .then((d: AgentSessionRow[]) => {
        if (cancelled || !Array.isArray(d)) return;
        setActiveGameIds(
          d.map((s) => s.game_id).filter((id): id is string => Boolean(id)),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const items: GameListItem[] = useMemo(() => {
    if (!games) return [];
    // Decrypted names come from the profile cache (E2EE display_name).
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
    return games.map((g) => {
      const share = g.sharing ?? { family: false, profileIds: [] };
      // The owning kid (for kid-created games) always counts as audience.
      const audienceIds = new Set(share.profileIds);
      if (g.profile_id) audienceIds.add(g.profile_id);
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
  }, [games, profiles]);

  return (
    <div className="flex flex-col gap-4">
      <PageHead
        title={t("title")}
        sub={t("subtitle")}
        action={
          <Button asChild>
            <Link href="/parent/game-studio/new">
              <Icon name="sparkles" size={16} />
              {t("newGame")}
            </Link>
          </Button>
        }
      />

      {/* Make-a-game CTA */}
      <Link
        href="/parent/game-studio/new"
        className="group flex items-center gap-4 rounded-2xl border border-primary-soft-2 bg-gradient-to-br from-primary-soft to-card px-4 py-4 transition-colors hover:border-primary"
      >
        <Image
          src="/images/dodi-active.png"
          alt=""
          width={52}
          height={52}
          className="h-[52px] w-[52px] shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold tracking-tight text-ink-1">
            {t("emptyTitle")}
          </div>
          <div className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-muted-foreground">
            {t("emptyDesc")}
          </div>
        </div>
        <Button className="hidden shrink-0 sm:inline-flex">
          <Icon name="sparkles" size={14} />
          {t("startBuilding")}
        </Button>
      </Link>

      <Section title={t("yourGames")} desc={t("yourGamesDesc")}>
        {games === null ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            …
          </p>
        ) : items.length === 0 ? (
          <p className="px-1 py-6 text-center text-sm text-muted-foreground">
            {t("noGames")}
          </p>
        ) : (
          <GameStudioList items={items} activeGameIds={activeGameIds} />
        )}
      </Section>
    </div>
  );
}
