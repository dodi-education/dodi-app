"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { GameRemixControls } from "@/components/games/game-remix-controls";
import { GameSandbox } from "@/components/games/game-sandbox";
import { GameViewShell } from "@/components/games/game-view-shell";

interface GameEditViewProps {
  gameId: string;
  profileId: string;
  title: string;
  description: string;
  codeBundle: string;
}

export function GameEditView({
  gameId,
  profileId,
  title,
  description,
  codeBundle,
}: GameEditViewProps) {
  const t = useTranslations("games");
  const [gameState, setGameState] = useState<Record<string, unknown>>({});

  return (
    <GameViewShell
      backHref={`/games/${gameId}`}
      backLabel={t("backToPlay")}
      title={t("editTitle", { title })}
      description={description}
    >
      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <GameRemixControls
          mode="remix"
          profileId={profileId}
          gameId={gameId}
          gameState={gameState}
        />

        <div className="rounded-[20px] bg-white p-2 shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
          <GameSandbox
            gameId={gameId}
            codeBundle={codeBundle}
            className="h-[66vh] min-h-[440px] w-full rounded-xl border bg-white"
            onStateChange={setGameState}
          />
        </div>
      </div>
    </GameViewShell>
  );
}
