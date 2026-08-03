"use client";

import { useEffect, useState } from "react";

import { GameStage } from "@/components/games/game-stage";
import type { GameGoal } from "@dodi/types/games";

/**
 * Broadcast by the public action buttons' trash icon; remounts the stage so
 * the game restarts fresh. A window event (same pattern as kid-tab-reselect)
 * because the buttons live in the title-bar slot, not in this subtree.
 */
export const PUBLIC_GAME_RESET_EVENT = "public-game-reset";

/**
 * Anonymous play surface: just the sandboxed stage. No autosave, no play
 * tracking (game_plays requires an authed account + kid by RLS), no dodi
 * session — those live in GamePlayView for signed-in kids. Reset works
 * without an account: there is no saved state, so a fresh mount IS a reset.
 */
export function PublicGamePlay({
  gameId,
  codeBundle,
  goal,
  locale,
}: {
  gameId: string;
  codeBundle: string;
  goal?: GameGoal;
  locale?: string;
}) {
  const [resetNonce, setResetNonce] = useState(0);

  useEffect(() => {
    const handleReset = () => setResetNonce((nonce) => nonce + 1);
    window.addEventListener(PUBLIC_GAME_RESET_EVENT, handleReset);
    return () =>
      window.removeEventListener(PUBLIC_GAME_RESET_EVENT, handleReset);
  }, []);

  return (
    <GameStage
      key={resetNonce}
      gameId={gameId}
      codeBundle={codeBundle}
      goal={goal}
      locale={locale}
      variant="framed"
      align="start"
    />
  );
}
