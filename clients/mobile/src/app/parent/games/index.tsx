import { type Href, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "use-intl";
import {
  type GameListItem,
  buildGameListItems,
  deleteGame as deleteOwnedGame,
} from "@dodi/client-state/game-library";
import { settleAll } from "@dodi/client-state/pull-refresh";
import { libraryEmpty } from "@dodi/ui-recipes";

import { DiscoverList } from "@/components/games-library/discover-list";
import { GameImportDialog } from "@/components/games-library/game-import-dialog";
import { GameStudioList } from "@/components/games-library/game-studio-list";
import { PageActions, Section } from "@/components/parent/section";
import { ShellContent } from "@/components/shared/shell-content";
import { Button, Text } from "@/components/ui";
import { clientState } from "@/lib/client-state";
import { gameFlowDeps } from "@/lib/game-flow-deps";
import { useAccountGames } from "@/lib/use-account-games";
import { useKids } from "@/lib/use-kids";

/**
 * The games list (web: parent/games/page), as it renders on a phone: "Your
 * games" plus dodi Discover. Creating and editing open the Game Studio at
 * /parent/game-studio/{id}.
 */
export default function ParentGamesScreen() {
  const t = useTranslations("gameStudio");
  const router = useRouter();
  const { kids } = useKids();
  // Decrypted titles come from the game cache (E2EE title/description).
  const { games } = useAccountGames();
  const [isImportOpen, setIsImportOpen] = useState(false);

  // Deleting cascades server-side; the shared flow drops the game cache so
  // every view refetches.
  const deleteGame = useCallback(
    async (id: string) => {
      try {
        await deleteOwnedGame(gameFlowDeps(), id);
      } catch (e) {
        throw new Error(e instanceof Error && e.message ? e.message : t("deleteFailedGeneric"));
      }
    },
    [t],
  );

  // A planning draft has no name until its settings are saved.
  const items: GameListItem[] = useMemo(
    () => buildGameListItems(games, kids, t("untitledPlan")),
    [games, kids, t],
  );

  // Pull to refresh: your games past the cache, plus the kids for their
  // audience names (Discover reloads itself).
  const refresh = (): Promise<void> =>
    settleAll([() => clientState.games.getState().loadAccount(true), () => clientState.kids.getState().loadList(true)]);

  return (
    <ShellContent onRefresh={refresh}>
      <PageActions>
        <Button variant="outline" icon="upload" onPress={() => setIsImportOpen(true)}>
          {t("importGame")}
        </Button>
        <Button icon="sparkles" onPress={() => router.push("/parent/game-studio/new" as Href)}>
          {t("addGame")}
        </Button>
      </PageActions>

      <GameImportDialog isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} />

      <Section title={t("yourGames")}>
        {games === null ? (
          <Text className={libraryEmpty}>…</Text>
        ) : items.length === 0 ? (
          <Text className={libraryEmpty}>{t("noGames")}</Text>
        ) : (
          <GameStudioList items={items} onDelete={deleteGame} />
        )}
      </Section>

      <Section title={t("discoverTitle")} desc={t("discoverSubtitle")}>
        <DiscoverList />
      </Section>
    </ShellContent>
  );
}
