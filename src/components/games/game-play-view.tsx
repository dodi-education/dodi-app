"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { GameCompanionPanel } from "@/components/games/game-companion-panel";
import { GameSandbox, type GameSandboxHandle } from "@/components/games/game-sandbox";
import { Button } from "@/components/ui/button";
import { gameDebug, gameDebugWarn } from "@/lib/games/debug";
import type { GameToParentMessage, GameCommand } from "@/types/games";

interface GamePlayViewProps {
  gameId: string;
  profileId: string;
  title: string;
  description: string;
  codeBundle: string;
  markdown: string;
}

export function GamePlayView({
  gameId,
  profileId,
  title,
  description,
  codeBundle,
  markdown,
}: GamePlayViewProps) {
  const t = useTranslations("games");

  const sandboxRef = useRef<GameSandboxHandle | null>(null);
  const [gameState, setGameState] = useState<Record<string, unknown>>({});
  const [gameError, setGameError] = useState<string | null>(null);

  const logEvent = useCallback(async (event: string, message: string) => {
    try {
      await fetch(`/api/games/${gameId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          event,
          message,
        }),
      });
    } catch {
      // Event logging should never block gameplay.
    }
  }, [gameId, profileId]);

  const runCommands = useCallback((commands: GameCommand[]): void => {
    gameDebug("playview", `runCommands called with ${commands.length} commands`);

    if (commands.length === 0) {
      gameDebug("playview", "No commands to run");
      return;
    }

    if (!sandboxRef.current) {
      gameDebugWarn("playview", "Sandbox ref is null — cannot send commands");
      setGameError(t("sandboxNotReady"));
      return;
    }

    for (const command of commands) {
      gameDebug("playview", `Sending command to sandbox:`, command);
      sandboxRef.current.sendCommand(command);
    }
  }, [t]);

  const handleSandboxMessage = useCallback((message: GameToParentMessage): void => {
    gameDebug("playview", `Received message from sandbox: ${message.type}`, message);

    if (message.type === "game:error") {
      gameDebugWarn("playview", `Game error: ${message.payload.error}`);
      setGameError(message.payload.error);
      return;
    }

    if (message.type === "game:result") {
      if (message.payload.result.ok) {
        gameDebug("playview", `Command succeeded: ${message.payload.command.type}`);
        setGameError(null);
        void logEvent(
          "game_command_executed",
          `Executed command: ${message.payload.command.type}`,
        );
      } else {
        const error = message.payload.result.error ?? t("unknownCommandError");
        gameDebugWarn("playview", `Command failed: ${message.payload.command.type} — ${error}`);
        setGameError(error);
        void logEvent(
          "game_command_failed",
          `${message.payload.command.type} failed: ${error}`,
        );
      }
    }
  }, [logEvent, t]);

  return (
    <div className="w-full max-w-6xl space-y-4 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-dodi-800">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/games/${gameId}/edit`}>{t("remixAction")}</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <GameCompanionPanel
          gameId={gameId}
          profileId={profileId}
          gameState={gameState}
          markdown={markdown}
          codeBundle={codeBundle}
          lastGameError={gameError}
          onRunCommands={runCommands}
        />

        <div className="rounded-2xl border bg-white p-2 shadow-sm">
          <GameSandbox
            ref={sandboxRef}
            gameId={gameId}
            codeBundle={codeBundle}
            className="h-[66vh] min-h-[440px] w-full rounded-xl border bg-white"
            onStateChange={setGameState}
            onMessage={handleSandboxMessage}
          />
        </div>
      </div>
    </div>
  );
}
