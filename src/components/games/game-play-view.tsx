"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { GameSandbox, type GameSandboxHandle } from "@/components/games/game-sandbox";
import { GameViewShell } from "@/components/games/game-view-shell";
import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import { gameDebug, gameDebugWarn } from "@/lib/games/debug";
import { useDodiContext } from "@/hooks/use-dodi-context";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
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

  // Declare Dodi context for this game
  useDodiContext({
    context: { type: "game", gameId, markdown, codeBundle, gameState: {} },
    displayMode: "full",
    profileId,
  });

  const sandboxRef = useRef<GameSandboxHandle | null>(null);
  const snapshotResolverRef = useRef<((data: string | null) => void) | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);

  const updateGameState = useDodiSessionStore((s) => s.updateGameState);
  const setOnRunCommands = useDodiSessionStore((s) => s.setOnRunCommands);
  const setOnRequestSnapshot = useDodiSessionStore((s) => s.setOnRequestSnapshot);

  const handleCommandResult = useCallback((state: Record<string, unknown>) => {
    updateGameState(state, true);
  }, [updateGameState]);

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

  // Request a canvas snapshot from the sandbox (used by read_game_state)
  const requestSnapshot = useCallback((): Promise<string | null> => {
    return new Promise<string | null>((resolve) => {
      if (!sandboxRef.current) {
        resolve(null);
        return;
      }
      snapshotResolverRef.current = resolve;
      sandboxRef.current.sendCommand({ type: "get_snapshot" });
      // Timeout after 3 seconds
      const timer = setTimeout(() => {
        if (snapshotResolverRef.current === resolve) {
          snapshotResolverRef.current = null;
          resolve(null);
        }
      }, 3000);
      // Store cleanup ref so resolver can cancel the timeout
      const origResolve = resolve;
      snapshotResolverRef.current = (data: string | null) => {
        clearTimeout(timer);
        origResolve(data);
      };
    });
  }, []);

  // Register command + snapshot handlers with the Dodi session store
  useEffect(() => {
    setOnRunCommands(runCommands);
    setOnRequestSnapshot(requestSnapshot);
    return () => {
      setOnRunCommands(null);
      setOnRequestSnapshot(null);
    };
  }, [runCommands, requestSnapshot, setOnRunCommands, setOnRequestSnapshot]);

  const handleSandboxMessage = useCallback((message: GameToParentMessage): void => {
    gameDebug("playview", `Received message from sandbox: ${message.type}`, message);

    if (message.type === "game:error") {
      gameDebugWarn("playview", `Game error: ${message.payload.error}`);
      setGameError(message.payload.error);
      return;
    }

    // Handle snapshot events from get_snapshot command
    if (message.type === "game:event" && message.payload.event === "snapshot") {
      const snapshot = (message.payload as Record<string, unknown>).snapshot as string | null;
      gameDebug("playview", `Received snapshot (${snapshot ? snapshot.length : 0} chars)`);
      if (snapshotResolverRef.current) {
        snapshotResolverRef.current(snapshot ?? null);
        snapshotResolverRef.current = null;
      }
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
    <GameViewShell
      backHref="/games"
      backLabel={t("title")}
      title={title}
      description={description}
      action={
        <KidButton asChild variant="ghost" size="sm">
          <Link href={`/games/${gameId}/edit`}>
            <Icon name="refresh" size={14} />
            {t("remixAction")}
          </Link>
        </KidButton>
      }
    >
      {gameError && (
        <div className="mb-4 rounded-[14px] bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
          {t("gameCommandFailedLabel")}: {gameError}
        </div>
      )}

      <div className="rounded-[20px] bg-white p-2 shadow-[0_2px_10px_rgba(34,56,78,0.05)]">
        <GameSandbox
          ref={sandboxRef}
          gameId={gameId}
          codeBundle={codeBundle}
          className="h-[66vh] min-h-[440px] w-full rounded-xl border bg-white"
          onStateChange={updateGameState}
          onCommandResult={handleCommandResult}
          onMessage={handleSandboxMessage}
        />
      </div>
    </GameViewShell>
  );
}
