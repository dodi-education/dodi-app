"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { PageActions, Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import {
  GameStudioList,
  type GameListItem,
} from "@/components/parent/games/game-studio-list";
import { DiscoverList } from "@/components/parent/games/discover-list";
import { GameImportDialog } from "@/components/parent/games/game-import-dialog";
import { useAccountGames } from "@/hooks/use-games";
import { useKids } from "@/hooks/use-kids";
import { dodi } from "@/lib/api";
import { useGameStore } from "@/stores/game-store";
import { isUnbuiltBundle } from "@dodi/games/placeholder";

/**
 * The games list — "Your games" plus dodi Discover — at `/parent/games`.
 * Creating and editing still open the full Game Studio at
 * `/parent/game-studio/{id}`; only the list itself lives here.
 */
export default function ParentGamesPage() {
  const t = useTranslations("gameStudio");

  const { kids } = useKids();
  // Decrypted titles come from the game cache (E2EE title/description).
  const { games } = useAccountGames();
  const [importOpen, setImportOpen] = useState(false);

  // Deleting cascades to versions, sharings, favorites and autosaves server-side;
  // here we just drop the whole game cache so every view refetches (the kid
  // libraries hold copies of this row too).
  const deleteGame = useCallback(
    async (id: string) => {
      const res = await dodi.request(`/api/games/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || t("deleteFailedGeneric"));
      }
      // Clearing the cache makes useAccountGames refetch on the next render.
      useGameStore.getState().invalidate();
    },
    [t],
  );

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
        sharing: share,
        // Readable only because the store decrypted the bundle for us.
        built: !isUnbuiltBundle(g.code_bundle),
        previewImage: g.preview_image,
        plays: g.plays,
        copies: g.copies,
      };
    });
  }, [games, kids]);

  return (
    <div>
      <PageActions>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Icon name="upload" size={16} />
          {t("importGame")}
        </Button>
        <Button asChild>
          <Link href="/parent/game-studio/new">
            <Icon name="sparkles" size={16} />
            {t("addGame")}
          </Link>
        </Button>
      </PageActions>

      <GameImportDialog open={importOpen} onOpenChange={setImportOpen} />

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
          <GameStudioList items={items} onDelete={deleteGame} />
        )}
      </Section>

      <Section title={t("discoverTitle")} desc={t("discoverSubtitle")}>
        <DiscoverList />
      </Section>
    </div>
  );
}
