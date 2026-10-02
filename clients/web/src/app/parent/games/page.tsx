"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import { PageActions, Section } from "@/components/parent/section";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/shared/icon";
import { GameStudioList } from "@/components/parent/games/game-studio-list";
import { DiscoverList } from "@/components/parent/games/discover-list";
import { GameImportDialog } from "@/components/parent/games/game-import-dialog";
import { useAccountGames } from "@/hooks/use-games";
import { useKids } from "@/hooks/use-kids";
import { gameFlowDeps } from "@/lib/games/game-flow-deps";
import {
  type GameListItem,
  buildGameListItems,
  deleteGame as deleteOwnedGame,
} from "@dodi/client-state/game-library";
import { libraryEmpty } from "@dodi/ui-recipes";

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
      try {
        // Clearing the cache makes useAccountGames refetch on the next render.
        await deleteOwnedGame(gameFlowDeps(), id);
      } catch (e) {
        throw new Error(
          e instanceof Error && e.message ? e.message : t("deleteFailedGeneric"),
        );
      }
    },
    [t],
  );

  // Decrypted titles come from the game cache, names from the kid cache (E2EE).
  // A planning draft has no name until its settings are saved.
  const items: GameListItem[] = useMemo(
    () => buildGameListItems(games, kids, t("untitledPlan")),
    [games, kids, t],
  );

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
          <p className={libraryEmpty}>
            …
          </p>
        ) : items.length === 0 ? (
          <p className={libraryEmpty}>
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
