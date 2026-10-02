import type { ReactNode, Ref } from "react";
import { View } from "react-native";
import { STAGE } from "@dodi/games/stage";
import type { GameGoal, GameSaveState, GameToParentMessage } from "@dodi/types/games";
import { gameStage } from "@dodi/ui-recipes";

import { cn } from "@/lib/cn";

import { GameSandbox, type GameProgressUpdate, type GameSandboxHandle } from "./game-sandbox";

interface GameStageProps {
  gameId: string;
  codeBundle: string;
  /** Learning goal + success criteria delivered to the game on init. */
  goal?: GameGoal;
  /** Saved state to restore on init (snapshot play). */
  savedState?: GameSaveState;
  /** Viewer locale delivered to the game on init (resolved by `dodi.translate`). */
  locale?: string;
  /** Forwarded to the underlying sandbox so callers can send commands / snapshots. */
  sandboxRef?: Ref<GameSandboxHandle>;
  onMessage?: (message: GameToParentMessage) => void;
  onStateChange?: (state: Record<string, unknown>) => void;
  onCommandResult?: (state: Record<string, unknown>) => void;
  onProgress?: (update: GameProgressUpdate) => void;
  /** `framed`: white card (studio preview, play). `bleed`: no chrome, centered. */
  variant?: "framed" | "bleed";
  className?: string;
}

/**
 * An AI-generated game in the canonical fixed 4:5 portrait stage, as the web
 * renders it on a phone: the card fills the column width.
 */
export function GameStage({
  gameId,
  codeBundle,
  goal,
  savedState,
  locale,
  sandboxRef,
  onMessage,
  onStateChange,
  onCommandResult,
  onProgress,
  variant = "framed",
  className,
}: GameStageProps): ReactNode {
  const isFramed = variant === "framed";
  const card = (
    <View
      className={cn("w-full", isFramed ? gameStage.framed : gameStage.bleed)}
      style={{ aspectRatio: STAGE.aspectW / STAGE.aspectH }}
    >
      <GameSandbox
        ref={sandboxRef}
        gameId={gameId}
        codeBundle={codeBundle}
        goal={goal}
        savedState={savedState}
        locale={locale}
        onMessage={onMessage}
        onStateChange={onStateChange}
        onCommandResult={onCommandResult}
        onProgress={onProgress}
      />
    </View>
  );
  if (isFramed) return <View className={cn("w-full", className)}>{card}</View>;
  return <View className={cn(gameStage.bleedWrap, className)}>{card}</View>;
}
