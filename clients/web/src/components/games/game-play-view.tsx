"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { type GameSandboxHandle } from "@/components/games/game-sandbox";
import { GameStage } from "@/components/games/game-stage";
import { GameViewShell } from "@/components/games/game-view-shell";
import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import type { GameAssistantAction } from "@/components/dodi/dodi-full-game";
import { useOnline } from "@/hooks/use-online";
import { gamePlayDeps } from "@/lib/games/game-play-deps";
import { STAGE } from "@/lib/games/stage";
import { cn } from "@/lib/utils";
import {
  type CapturedSnapshot,
  type GamePlayInfo,
  createGamePlaySession,
  playGoal,
} from "@dodi/client-state/game-play";
import { gameDebug } from "@dodi/games/debug";
import type { ProgressKind, SuccessCriteria } from "@dodi/games/success";
import { gamePlayActions } from "@dodi/ui-recipes";
import { useDodiContext } from "@/hooks/use-dodi-context";
import { useDodiSessionStore } from "@/stores/dodi-session-store";
import { createGameCompanion } from "@dodi/client-state/game-companion";
import { gameGenerators } from "@/lib/ai/game-generators";
import { downscaleDataUrl } from "@/lib/games/thumbnail";
import { SnapshotFlash } from "@/components/snapshots/snapshot-flash";
import { useVaultStore } from "@/stores/vault-store";
import type {
  DrawingStyle,
  GameSaveState,
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
  drawingStyle: DrawingStyle;
  /**
   * Present when resuming a SNAPSHOT: the saved state to restore, plus the
   * original game's soft reference. Snapshot sessions record no game_plays
   * (the game row may be deleted or another family's).
   */
  snapshot?: { id: string; savedState: GameSaveState; gameId: string | null };
  /** Game title/description for snapshot play (the `title` prop then carries the snapshot title). */
  inlineContext?: { title: string; description: string };
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
  drawingStyle,
  snapshot,
  inlineContext,
}: GamePlayViewProps) {
  const t = useTranslations("games");
  const tSnapshots = useTranslations("snapshots");
  // In kid view this resolves to the kid's language (dodi-kid-locale cookie).
  const locale = useLocale();

  // Declare Dodi context for this game (or snapshot session)
  useDodiContext({
    context: {
      type: "game",
      gameId,
      snapshotId: snapshot?.id,
      inline: inlineContext,
      markdown,
      codeBundle,
      gameState: {},
      capabilities,
    },
    displayMode: "full",
    kidId,
  });

  const sandboxRef = useRef<GameSandboxHandle | null>(null);
  const stageCardRef = useRef<HTMLDivElement | null>(null);
  const snapshotResolverRef = useRef<((data: string | null) => void) | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ image: string; startRect: DOMRect } | null>(
    null,
  );

  const chatSubmitting = useDodiSessionStore((s) => s.chatSubmitting);
  const updateGameState = useDodiSessionStore((s) => s.updateGameState);
  const setOnRunCommands = useDodiSessionStore((s) => s.setOnRunCommands);
  const setOnRequestSnapshot = useDodiSessionStore((s) => s.setOnRequestSnapshot);
  const resetGameAssistance = useDodiSessionStore((s) => s.resetGameAssistance);

  // ── Progress & success tracking ────────────────────────────────────────
  const goal = useMemo(
    () => playGoal({ progressKind, successCriteria, learningGoal, successDefinition }),
    [progressKind, successCriteria, learningGoal, successDefinition],
  );

  // Request a canvas snapshot from the sandbox (used by analyze_game_state and
  // as the gallery thumbnail when saving a snapshot)
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

  // ── The shared play session (@dodi/client-state/game-play) ─────────────
  // Progress/success, play tracking (play-sync outbox), the autosave slot,
  // the save-state channel and snapshot capture → seal → save live there. It
  // is kept on the current props (update, before the play/autosave effects)
  // and this view's handlers (setHost, below; same commit, so before the
  // sandbox can send anything).
  const isSnapshotSession = !!snapshot;
  const playInfo = useMemo<GamePlayInfo>(
    () => ({
      gameId,
      kidId,
      title,
      description,
      codeBundle,
      markdown,
      capabilities,
      drawingStyle,
      goal,
      snapshot,
      inlineContext,
    }),
    [
      gameId,
      kidId,
      title,
      description,
      codeBundle,
      markdown,
      capabilities,
      drawingStyle,
      goal,
      snapshot,
      inlineContext,
    ],
  );
  const [playSession] = useState(() =>
    createGamePlaySession(gamePlayDeps(), playInfo),
  );
  useEffect(() => {
    playSession.update(playInfo);
  }, [playSession, playInfo]);

  const handleStateChange = useCallback(
    (state: Record<string, unknown>) => {
      updateGameState(state);
      // Progress + the debounced autosave (games push state after each interaction).
      playSession.handleState(state);
    },
    [updateGameState, playSession],
  );

  const handleCommandResult = useCallback((state: Record<string, unknown>) => {
    updateGameState(state);
    playSession.handleState(state);
  }, [updateGameState, playSession]);

  // Start a game_plays record on mount; finalize it on unmount. Snapshot
  // sessions record no play — `gameId` may reference a deleted or foreign game.
  useEffect(() => {
    resetGameAssistance();
    return playSession.beginPlay();
  }, [gameId, kidId, isSnapshotSession, resetGameAssistance, playSession]);

  // ── The companion's side of the play (@dodi/client-state/game-companion) ──
  // dodi's meta-commands (generate_drawing / generate_text / generate_voice /
  // save_snapshot / share_snapshot) and the game's own rate-limited text and
  // voice requests: provider calls run on the device with the vault-held keys,
  // a held-open voice tool call is released once the work landed or failed.
  const [companion] = useState(() =>
    createGameCompanion(
      { session: useDodiSessionStore, generators: gameGenerators },
      playInfo,
    ),
  );
  useEffect(() => {
    companion.update(playInfo);
  }, [companion, playInfo]);

  // ── Autosave: one hidden resume slot per kid + game ─────────────────────
  // Each game interaction (state push from the sandbox) schedules a debounced
  // upload of the full serialization into the slot (in the session); on open
  // the slot is restored so the kid continues where they left off. Snapshot
  // sessions restore their own savedState and never autosave.
  const vaultSession = useVaultStore((s) => s.session);
  const vaultStatus = useVaultStore((s) => s.status);
  const [autosave, setAutosave] = useState<{
    checked: boolean;
    savedState?: GameSaveState;
  }>(() => ({ checked: isSnapshotSession }));
  const autosaveCheckedRef = useRef(isSnapshotSession);

  useEffect(() => {
    if (autosaveCheckedRef.current) return;
    if (!vaultSession) {
      // The kid layout unlocks the vault silently; if it settles locked
      // anyway, start fresh rather than withholding the game. Deferred off
      // the synchronous effect tick (set-state-in-effect lint).
      if (vaultStatus === "locked" || vaultStatus === "needs-setup") {
        autosaveCheckedRef.current = true;
        void Promise.resolve().then(() => setAutosave({ checked: true }));
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      // Unreadable slot → undefined: play fresh; the next autosave overwrites it.
      const savedState = await playSession.loadAutosave(vaultSession);
      if (cancelled) return;
      autosaveCheckedRef.current = true;
      setAutosave({ checked: true, savedState });
    })();
    return () => {
      cancelled = true;
    };
  }, [kidId, gameId, vaultSession, vaultStatus, playSession]);

  // ── Reset: remount the sandbox with no saved state ──────────────────────
  // Host-level and game-agnostic — the game boots exactly as on first open.
  // The fresh state then flows through the regular autosave pipeline (the
  // ready-state push plus the session's direct schedule), overwriting the
  // slot so the reset survives a reload.
  const [resetNonce, setResetNonce] = useState(0);
  const handleResetGame = useCallback((): void => {
    setGameError(null);
    setAutosave({ checked: true });
    setResetNonce((nonce) => nonce + 1);
    playSession.restartFresh();
  }, [playSession]);

  useEffect(() => () => playSession.dispose(), [playSession]);

  // iOS-screenshot-style feedback: the captured image shrinks from the game
  // stage into a small card above the Snapshots nav item (see SnapshotFlash).
  const triggerSnapshotFlash = useCallback(
    (content: CapturedSnapshot): void => {
      const image = content.rawSnapshot ?? content.info.thumbnail;
      const stage = stageCardRef.current;
      if (!image || !stage) return;
      setFlash({ image, startRect: stage.getBoundingClientRect() });
    },
    [],
  );

  // The view around the companion: sandbox access, the snapshot flows (with
  // the flash), the error banner and the kid-facing failure texts.
  useEffect(() => {
    companion.setHost({
      sandbox: () => sandboxRef.current,
      saveSnapshot: (requestedTitle) =>
        playSession.saveSnapshot({ requestedTitle, onCaptured: triggerSnapshotFlash }),
      shareSnapshot: (friendName, requestedTitle) =>
        playSession.shareSnapshot({
          friendName,
          requestedTitle,
          onCaptured: triggerSnapshotFlash,
        }),
      onGameError: setGameError,
      messages: {
        noImageModel: () => t("noImageModel"),
        drawingFailed: () => t("drawingFailed"),
        noThinkingModel: () => t("noThinkingModel"),
        textGenerationFailed: () => t("textGenerationFailed"),
        snapshotSaveFailed: () => t("snapshotSaveFailed"),
        snapshotShareFailed: () => t("snapshotShareFailed"),
        sandboxNotReady: () => t("sandboxNotReady"),
      },
    });
  }, [companion, playSession, triggerSnapshotFlash, t]);

  // ── Title-bar photo button + Dodi panel quick actions ─────────────────────
  const isOnline = useOnline();
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  // The button variant of the `save_snapshot` voice command. Safe to call
  // without a pending voice tool call: resolveClientCommand no-ops then.
  const handlePhotoButton = useCallback(async (): Promise<void> => {
    if (savingSnapshot) return;
    setSavingSnapshot(true);
    try {
      await companion.saveSnapshot();
    } finally {
      setSavingSnapshot(false);
    }
  }, [savingSnapshot, companion]);

  // Contextual chips in the Dodi panel. The photo chip runs the capture
  // directly; the rest go through the chat as the kid's own words, so dodi
  // answers (and e.g. asks WHICH friend before emitting share_snapshot) —
  // calling the share flow directly would fail silently without a
  // friend_name and a pending voice call to report through.
  const assistantActions = useMemo<GameAssistantAction[]>(() => {
    if (!isOnline || isSnapshotSession) return [];
    const ask = (prompt: string) => () => {
      void useDodiSessionStore.getState().sendTextMessage(prompt, gameId);
    };
    return [
      {
        id: "photo",
        icon: "camera",
        label: t("chipSavePhoto"),
        disabled: savingSnapshot,
        onSelect: () => void handlePhotoButton(),
      },
      {
        id: "share",
        icon: "share",
        label: t("chipShareFriend"),
        disabled: chatSubmitting,
        onSelect: ask(t("chipSharePrompt")),
      },
      {
        id: "explain",
        icon: "info",
        label: t("chipExplain"),
        disabled: chatSubmitting,
        onSelect: ask(t("chipExplainPrompt")),
      },
      {
        id: "hint",
        icon: "sparkles",
        label: t("chipHint"),
        disabled: chatSubmitting,
        onSelect: ask(t("chipHintPrompt")),
      },
    ];
  }, [
    isOnline,
    isSnapshotSession,
    gameId,
    savingSnapshot,
    chatSubmitting,
    handlePhotoButton,
    t,
  ]);

  // Register command + snapshot handlers with the Dodi session store
  useEffect(() => {
    setOnRunCommands(companion.runCommands);
    setOnRequestSnapshot(requestSnapshot);
    return () => {
      setOnRunCommands(null);
      setOnRequestSnapshot(null);
    };
  }, [companion, requestSnapshot, setOnRunCommands, setOnRequestSnapshot]);

  // The view around the session: sandbox access, the error banner, and the
  // companion for the game's own text/voice requests.
  useEffect(() => {
    playSession.setHost({
      sandbox: () => sandboxRef.current,
      // The host-observed "asking dodi" count joins the success metrics.
      assistanceCount: () => useDodiSessionStore.getState().gameAssistanceCount,
      captureImage: () => requestSnapshot(),
      thumbnail: (dataUrl) => downscaleDataUrl(dataUrl),
      unknownCommandError: () => t("unknownCommandError"),
      onGameError: setGameError,
      onGameTextRequest: (request) => companion.handleGameTextRequest(request),
      onGameVoiceRequest: (text) => companion.handleGameVoiceRequest(text),
    });
  }, [playSession, requestSnapshot, t, companion]);

  const handleSandboxMessage = useCallback((message: GameToParentMessage): void => {
    gameDebug("playview", `Received message from sandbox: ${message.type}`, message);

    // Handle snapshot events from get_snapshot command
    if (message.type === "game:event" && message.payload.event === "snapshot") {
      const snapshotData = (message.payload as Record<string, unknown>).snapshot as string | null;
      gameDebug("playview", `Received snapshot (${snapshotData ? snapshotData.length : 0} chars)`);
      if (snapshotResolverRef.current) {
        snapshotResolverRef.current(snapshotData ?? null);
        snapshotResolverRef.current = null;
      }
      return;
    }

    // Errors, save state, command results and the game's capability-gated
    // text/voice requests: routed by the session.
    playSession.handleMessage(message);
  }, [playSession]);

  return (
    <GameViewShell
      backHref={snapshot ? "/snapshots" : "/games"}
      backLabel={snapshot ? tSnapshots("title") : t("title")}
      title={title}
      assistantActions={assistantActions}
      action={
        isSnapshotSession ? undefined : (
          <div className={cn(gamePlayActions.webRow, gamePlayActions.row)}>
            <KidButton
              variant="ghost"
              size="none"
              onClick={() => void handlePhotoButton()}
              disabled={savingSnapshot || !autosave.checked}
              title={t("snapshotButton")}
              aria-label={t("snapshotButton")}
              className={cn(
                gamePlayActions.photo,
                gamePlayActions.photoText,
                gamePlayActions.webPhoto,
              )}
            >
              <Icon name="camera" size={20} stroke={2} />
              {t("snapshotButton")}
            </KidButton>
            <span
              className={gamePlayActions.divider}
              aria-hidden
            />
            <KidButton
              variant="icon"
              size="none"
              onClick={handleResetGame}
              disabled={!autosave.checked}
              title={t("resetGame")}
              aria-label={t("resetGame")}
              className={cn(
                gamePlayActions.reset,
                gamePlayActions.resetText,
                gamePlayActions.webReset,
              )}
            >
              <Icon name="delete" size={20} stroke={2} />
            </KidButton>
          </div>
        )
      }
    >
      {gameError && (
        <div className={cn(gamePlayActions.error, gamePlayActions.errorText)}>
          {t("gameCommandFailedLabel")}: {gameError}
        </div>
      )}

      {/* The stage mounts only after the autosave slot was checked, so the
          sandbox init already carries the restored state. */}
      {autosave.checked && (
        <GameStage
          key={resetNonce}
          sandboxRef={sandboxRef}
          stageRef={stageCardRef}
          gameId={gameId}
          codeBundle={codeBundle}
          goal={goal}
          savedState={snapshot?.savedState ?? autosave.savedState}
          locale={locale}
          align="start"
          reserved={STAGE.reservedKid}
          onStateChange={handleStateChange}
          onCommandResult={handleCommandResult}
          onProgress={playSession.handleProgress}
          onMessage={handleSandboxMessage}
        />
      )}

      {flash && (
        <SnapshotFlash
          image={flash.image}
          startRect={flash.startRect}
          onDone={() => setFlash(null)}
        />
      )}
    </GameViewShell>
  );
}
