import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { isStudioView, type StudioGame } from "@dodi/studio/studio-game";
import { loadStudioGame } from "@dodi/studio/studio-load";

import { mobileAuthApi } from "@/adapters/auth";
import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

import { GameStudio } from "./game-studio";

/**
 * Load a saved game and open it in the studio (web: the [id] route page). The
 * store decrypts the row; only the owning account may edit it. A missing or
 * foreign game goes back to the games list (the web 404s).
 */
export function EditGameStudio({ id, tab }: { id: string; tab?: string }) {
  const [initialGame, setInitialGame] = useState<StudioGame | null>(null);
  const [isMissing, setIsMissing] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    loadStudioGame(
      {
        api,
        loadGame: (gameId) => clientState.games.getState().loadOne(gameId),
        sessionUserId: async () => (await mobileAuthApi.sessionUser())?.id ?? null,
      },
      id,
    )
      .then((game) => {
        if (!isCurrent) return;
        if (game) setInitialGame(game);
        else setIsMissing(true);
      })
      .catch(() => {
        if (isCurrent) setIsMissing(true);
      });
    return () => {
      isCurrent = false;
    };
  }, [id]);

  if (isMissing) return <Redirect href="/parent/games" />;
  // Keyed by id: another game's deep link opens a fresh studio.
  if (!initialGame || initialGame.id !== id) return null;
  return <GameStudio key={id} initialGame={initialGame} initialView={isStudioView(tab) ? tab : undefined} />;
}
