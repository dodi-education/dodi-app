"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { GameRemixControls } from "@/components/games/game-remix-controls";
import { GameSandbox } from "@/components/games/game-sandbox";
import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";

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
        <div className="flex min-w-0 items-center gap-3.5">
          <KidButton asChild variant="back" size="sm">
            <Link href={`/games/${gameId}`}>
              <Icon name="arrow_left" size={15} stroke={2.2} />
              {t("backToPlay")}
            </Link>
          </KidButton>
          <div className="min-w-0">
            <h1 className="truncate text-[21px] font-extrabold text-ink">
              {t("editTitle", { title })}
            </h1>
            <p className="truncate text-sm font-semibold text-muted-foreground">
              {description}
            </p>
          </div>
        </div>
      </div>

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
    </div>
  );
}
