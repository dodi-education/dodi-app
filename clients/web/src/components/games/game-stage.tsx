"use client";

import type { Ref } from "react";

import {
  GameSandbox,
  type GameProgressUpdate,
  type GameSandboxHandle,
} from "@/components/games/game-sandbox";
import { STAGE, stageSizeStyle } from "@/lib/games/stage";
import { cn } from "@/lib/utils";
import type { GameGoal, GameSaveState, GameToParentMessage } from "@dodi/types/games";

interface GameStageProps {
  gameId: string;
  codeBundle: string;
  /** Learning goal + success criteria delivered to the game on init. */
  goal?: GameGoal;
  /** Saved state to restore on init (snapshot play). */
  savedState?: GameSaveState;
  /** Forwarded to the underlying sandbox so callers can send commands / snapshots. */
  sandboxRef?: Ref<GameSandboxHandle>;
  /** The stage card element — lets callers measure the visible game surface. */
  stageRef?: Ref<HTMLDivElement>;
  onMessage?: (message: GameToParentMessage) => void;
  onStateChange?: (state: Record<string, unknown>) => void;
  onCommandResult?: (state: Record<string, unknown>) => void;
  onProgress?: (update: GameProgressUpdate) => void;
  /**
   * `framed` — white card on the page background, top-aligned and centered
   *   horizontally (kid play / edit, studio preview). The parent decides vertical
   *   placement (the studio centers it; the kid views pin it to the top so it lines
   *   up with the Dodi sidebar).
   * `bleed`  — fills the parent and centers both axes, no card chrome (voice create).
   */
  variant?: "framed" | "bleed";
  /**
   * Horizontal placement of the framed card within its column.
   * `center` (default) — mx-auto, used by the studio preview.
   * `start` — pinned to the column's left edge, so it lines up with the title bar
   *   and Dodi sidebar in the kid play view.
   */
  align?: "center" | "start";
  /** Vertical chrome reserved around the stage for the dvh height budget. */
  reserved?: number;
  /** Extra classes on the outer wrapper. */
  className?: string;
}

/**
 * Renders an AI-generated game in the canonical fixed 4:5 portrait stage so it
 * looks identical across the studio preview and the kid views, scaled to fit each
 * device. Wraps {@link GameSandbox}; see {@link STAGE} for the shared dimensions.
 */
export function GameStage({
  gameId,
  codeBundle,
  goal,
  savedState,
  sandboxRef,
  stageRef,
  onMessage,
  onStateChange,
  onCommandResult,
  onProgress,
  variant = "framed",
  align = "center",
  reserved = STAGE.reservedKid,
  className,
}: GameStageProps) {
  const framed = variant === "framed";

  const card = (
    <div
      ref={stageRef}
      style={stageSizeStyle(reserved)}
      className={cn(
        // Portrait-mobile fills the column width (the page may scroll a little);
        // everywhere else the height budget caps the width so no scrolling occurs.
        "w-[var(--stage-w)] overflow-hidden max-lg:portrait:w-full",
        align === "start" ? "mr-auto" : "mx-auto",
        framed
          ? "rounded-[18px] border border-border bg-white shadow-[0_8px_28px_rgba(34,56,78,0.10)]"
          : "rounded-xl bg-white",
      )}
    >
      <GameSandbox
        ref={sandboxRef}
        gameId={gameId}
        codeBundle={codeBundle}
        goal={goal}
        savedState={savedState}
        className="h-full w-full border-0 bg-white"
        onMessage={onMessage}
        onStateChange={onStateChange}
        onCommandResult={onCommandResult}
        onProgress={onProgress}
      />
    </div>
  );

  if (framed) {
    // Block flow: the card pins to the top of its column (aligning with the Dodi
    // sidebar in the kid views) and is centered horizontally via mx-auto.
    return <div className={cn("w-full", className)}>{card}</div>;
  }

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center",
        className,
      )}
    >
      {card}
    </div>
  );
}
