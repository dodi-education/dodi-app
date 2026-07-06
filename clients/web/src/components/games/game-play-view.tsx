"use client";

import { dodi } from "@/lib/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  type GameProgressUpdate,
  type GameSandboxHandle,
} from "@/components/games/game-sandbox";
import { GameStage } from "@/components/games/game-stage";
import { GameViewShell } from "@/components/games/game-view-shell";
import { STAGE } from "@/lib/games/stage";
import { gameDebug, gameDebugWarn } from "@dodi/games/debug";
import {
  evaluateSuccess,
  isEmptyCriteria,
  mergeMetrics,
  type MetricsSummary,
  type ProgressKind,
  type SuccessCriteria,
} from "@dodi/games/success";
import { useDodiContext } from "@/hooks/use-dodi-context";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import {
  generateDrawing,
  NoImageModelError,
} from "@/lib/ai/client-generate-drawing";
import type {
  DodiProgressState,
  GameCommand,
  GameGoal,
  GameToParentMessage,
} from "@dodi/types/games";

interface GamePlayViewProps {
  gameId: string;
  kidId: string;
  title: string;
  description: string;
  codeBundle: string;
  markdown: string;
  learningGoal: string;
  successDefinition: string;
  successCriteria: SuccessCriteria;
  progressKind: ProgressKind;
  capabilities: string[];
}

export function GamePlayView({
  gameId,
  kidId,
  title,
  description,
  codeBundle,
  markdown,
  learningGoal,
  successDefinition,
  successCriteria,
  progressKind,
  capabilities,
}: GamePlayViewProps) {
  const t = useTranslations("games");

  // Declare Dodi context for this game
  useDodiContext({
    context: { type: "game", gameId, markdown, codeBundle, gameState: {}, capabilities },
    displayMode: "full",
    kidId,
  });

  const sandboxRef = useRef<GameSandboxHandle | null>(null);
  const snapshotResolverRef = useRef<((data: string | null) => void) | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);

  const updateGameState = useDodiSessionStore((s) => s.updateGameState);
  const setOnRunCommands = useDodiSessionStore((s) => s.setOnRunCommands);
  const setOnRequestSnapshot = useDodiSessionStore((s) => s.setOnRequestSnapshot);
  const beginAiActivity = useDodiSessionStore((s) => s.beginAiActivity);
  const endAiActivity = useDodiSessionStore((s) => s.endAiActivity);
  const resetGameAssistance = useDodiSessionStore((s) => s.resetGameAssistance);

  // ── Progress & success tracking ────────────────────────────────────────
  const goal = useMemo<GameGoal | undefined>(() => {
    if (progressKind !== "goal" || isEmptyCriteria(successCriteria)) return undefined;
    return { learningGoal, successDefinition, successCriteria, progressKind };
  }, [progressKind, successCriteria, learningGoal, successDefinition]);

  const playIdRef = useRef<string | null>(null);
  const succeededRef = useRef(false);
  const latestMetricsRef = useRef<MetricsSummary>({});
  const latestProgressRef = useRef(0);

  const patchPlay = useCallback(
    (body: Record<string, unknown>, keepalive = false): void => {
      const id = playIdRef.current;
      if (!id) return;
      try {
        void dodi.request(`/api/games/${gameId}/plays/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive,
        });
      } catch {
        // Persistence must never block gameplay.
      }
    },
    [gameId],
  );

  // Merge in the host-observed "asking Dodi" count, evaluate, and record success.
  const evaluateAndRecord = useCallback(
    (metrics: MetricsSummary, progress: number): void => {
      latestMetricsRef.current = metrics;
      latestProgressRef.current = progress;
      if (!goal || succeededRef.current) return;

      const dodiTurns = useDodiSessionStore.getState().gameAssistanceCount;
      const merged = mergeMetrics(metrics, { dodiTurns });
      const result = evaluateSuccess(goal.successCriteria, merged);
      if (result.succeeded) {
        succeededRef.current = true;
        gameDebug("playview", "Success criteria met", merged);
        sandboxRef.current?.notifySuccess({
          summary: goal.successDefinition,
          metrics: merged,
        });
        patchPlay({ succeeded: true, finalProgress: progress, metrics: merged });
      }
    },
    [goal, patchPlay],
  );

  const ingestDodiState = useCallback(
    (state: Record<string, unknown>): void => {
      const dodi = state.dodi as DodiProgressState | undefined;
      if (!dodi || typeof dodi !== "object") return;
      const metrics = { ...latestMetricsRef.current, ...(dodi.metrics ?? {}) };
      const progress =
        typeof dodi.progress === "number" ? dodi.progress : latestProgressRef.current;
      evaluateAndRecord(metrics, progress);
    },
    [evaluateAndRecord],
  );

  const handleProgress = useCallback(
    (update: GameProgressUpdate): void => {
      const metrics = { ...latestMetricsRef.current, ...(update.metrics ?? {}) };
      evaluateAndRecord(metrics, update.progress);
    },
    [evaluateAndRecord],
  );

  const handleStateChange = useCallback(
    (state: Record<string, unknown>) => {
      updateGameState(state);
      ingestDodiState(state);
    },
    [updateGameState, ingestDodiState],
  );

  const handleCommandResult = useCallback((state: Record<string, unknown>) => {
    updateGameState(state, true);
    ingestDodiState(state);
  }, [updateGameState, ingestDodiState]);

  // Start a game_plays record on mount; finalize it on unmount.
  useEffect(() => {
    resetGameAssistance();
    succeededRef.current = false;
    latestMetricsRef.current = {};
    latestProgressRef.current = 0;

    let cancelled = false;
    void (async () => {
      try {
        const res = await dodi.request(`/api/games/${gameId}/plays`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kidId }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { playId?: string };
        if (!cancelled && data.playId) playIdRef.current = data.playId;
      } catch {
        // Non-critical.
      }
    })();

    return () => {
      cancelled = true;
      const dodiTurns = useDodiSessionStore.getState().gameAssistanceCount;
      const merged = mergeMetrics(latestMetricsRef.current, { dodiTurns });
      patchPlay(
        { finalProgress: latestProgressRef.current, metrics: merged, ended: true },
        true,
      );
    };
  }, [gameId, kidId, resetGameAssistance, patchPlay]);

  const logEvent = useCallback(async (event: string, message: string) => {
    try {
      await dodi.request(`/api/games/${gameId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kidId,
          event,
          message,
        }),
      });
    } catch {
      // Event logging should never block gameplay.
    }
  }, [gameId, kidId]);

  // `generate_drawing` is a client-only meta-command: image generation needs the
  // vault key and can't run inside the sandbox (CSP: connect-src 'none'). We
  // generate the coloring sheet here, then push a `set_generated_image` command
  // with the resulting data URL into the sandbox.
  const handleGenerateDrawing = useCallback(
    async (command: GameCommand): Promise<void> => {
      const subject =
        typeof command.payload?.subject === "string" ? command.payload.subject : "";
      setGameError(null);
      beginAiActivity("image");
      try {
        const dataUrl = await generateDrawing(subject);
        sandboxRef.current?.sendCommand({
          type: "set_generated_image",
          payload: { dataUrl },
        });
        // Picture is on the canvas → release the held-open voice tool call so
        // Dodi announces it (she stayed silent while it generated). No-op if the
        // drawing wasn't triggered by a voice tool call.
        useDodiSessionStore.getState().resolveDrawingGeneration({ ok: true });
      } catch (error) {
        gameDebugWarn("playview", "generate_drawing failed:", error);
        const message =
          error instanceof NoImageModelError
            ? t("noImageModel")
            : t("drawingFailed");
        setGameError(message);
        useDodiSessionStore
          .getState()
          .resolveDrawingGeneration({ ok: false, error: message });
      } finally {
        endAiActivity("image");
      }
    },
    [t, beginAiActivity, endAiActivity],
  );

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
      if (command.type === "generate_drawing") {
        void handleGenerateDrawing(command);
        continue;
      }
      gameDebug("playview", `Sending command to sandbox:`, command);
      sandboxRef.current.sendCommand(command);
    }
  }, [t, handleGenerateDrawing]);

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
    >
      {gameError && (
        <div className="mb-4 rounded-[14px] bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
          {t("gameCommandFailedLabel")}: {gameError}
        </div>
      )}

      <GameStage
        sandboxRef={sandboxRef}
        gameId={gameId}
        codeBundle={codeBundle}
        goal={goal}
        align="start"
        reserved={STAGE.reservedKid}
        onStateChange={handleStateChange}
        onCommandResult={handleCommandResult}
        onProgress={handleProgress}
        onMessage={handleSandboxMessage}
      />
    </GameViewShell>
  );
}
