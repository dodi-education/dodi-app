"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { GameRemixControls } from "@/components/games/game-remix-controls";
import { GameSandbox } from "@/components/games/game-sandbox";
import { Button } from "@/components/ui/button";

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
    <div className="w-full max-w-6xl space-y-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dodi-800">{t("editTitle", { title })}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/games/${gameId}`}>{t("backToPlay")}</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <GameRemixControls
          mode="remix"
          profileId={profileId}
          gameId={gameId}
          gameState={gameState}
        />

        <div className="rounded-2xl border bg-white p-2 shadow-sm">
          <GameSandbox
            gameId={gameId}
            codeBundle={codeBundle}
            className="h-[66vh] min-h-[440px] w-full rounded-xl border bg-white"
            onStateChange={setGameState}
          />
        </div>
      </div>
    </div>
  );
}
