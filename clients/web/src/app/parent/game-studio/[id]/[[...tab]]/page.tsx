"use client";

import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { GameStudio } from "@/components/parent/games/game-studio";
import { dodi } from "@/lib/api";
import { getSessionUser } from "@/lib/auth/client";
import { useGameStore } from "@/stores/game-store";
import { isStudioView, type StudioGame, type StudioView } from "@dodi/studio/studio-game";
import { loadStudioGame } from "@dodi/studio/studio-load";

/**
 * The studio at `/parent/game-studio/{id}` and, with the optional segment, at
 * `/{id}/settings|code|preview` — deep links straight into a tab. One route
 * serves both so the heavy studio (live chat thread, running agent loop, mounted
 * sandbox iframe) is never remounted just to change tab; the studio itself keeps
 * the URL in step via history.replaceState. An unknown segment falls back to the
 * default tab rather than 404ing.
 */
export default function EditGameStudioPage() {
  const params = useParams<{ id: string; tab?: string[] }>();
  const id = params.id;
  const segment = params.tab?.[0];
  const initialView: StudioView | undefined = isStudioView(segment)
    ? segment
    : undefined;

  const [initialGame, setInitialGame] = useState<StudioGame | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The store decrypts the row; StudioGame is entirely plaintext. Only the
    // owning account may edit a game in the studio (excludes system games).
    loadStudioGame(
      {
        api: dodi,
        loadGame: (gameId) => useGameStore.getState().loadOne(gameId),
        sessionUserId: async () => (await getSessionUser())?.id ?? null,
      },
      id,
    )
      .then((game) => {
        if (cancelled) return;
        if (game) setInitialGame(game);
        else setMissing(true);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (missing) notFound();
  if (!initialGame) return null;

  return <GameStudio initialGame={initialGame} initialView={initialView} />;
}
