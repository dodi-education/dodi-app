import { Redirect } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { type KidGameOpenResult, gamePlayPropsFromGame, openKidGame } from "@dodi/client-state/game-play";

import { clientState, useActiveKidStore } from "@/lib/client-state";
import { logGameEvent } from "@/lib/play-sync";

import { GamePlayNotice } from "./game-play-notice";
import { GamePlayView } from "./game-play-view";

/**
 * The kid's /games/[id] (web: components/games/game-play-page): load the
 * decrypted game for the active kid, log the start through the play outbox,
 * then play. An unknown or hidden game goes back to the library (the web
 * 404s); offline without a cached copy says so.
 */
export function GamePlayPage({ gameId }: { gameId: string }) {
  const t = useTranslations("games");
  const kidId = useActiveKidStore((s) => s.activeKidId);
  const [opened, setOpened] = useState<{ key: string; result: KidGameOpenResult } | null>(null);
  const loggedRef = useRef<string | null>(null);
  const key = `${kidId}:${gameId}`;

  useEffect(() => {
    if (!kidId) return;
    let isCurrent = true;
    void openKidGame(clientState, gameId, kidId).then((result) => {
      if (!isCurrent) return;
      setOpened({ key: `${kidId}:${gameId}`, result });
      // Activity log via the offline-capable outbox; the game is referenced
      // by id (its title is E2EE).
      if (result.kind === "ok" && loggedRef.current !== `${kidId}:${gameId}`) {
        loggedRef.current = `${kidId}:${gameId}`;
        logGameEvent({ gameId, kidId, event: "game_started", message: "Started game" });
      }
    });
    return () => {
      isCurrent = false;
    };
  }, [gameId, kidId]);

  if (!kidId) return <GamePlayNotice title={t("title")} body={t("kidRequired")} />;
  const result = opened?.key === key ? opened.result : null;
  if (!result) return null;
  if (result.kind === "missing") return <Redirect href="/games" />;
  if (result.kind === "offline-unavailable") return <GamePlayNotice offlineText={t("offlineNotAvailable")} />;
  return <GamePlayView key={result.game.id} kidId={kidId} {...gamePlayPropsFromGame(result.game)} />;
}
