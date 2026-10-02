import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Dimensions, View } from "react-native";
import { useLocale, useTranslations } from "use-intl";
import { createGameCompanion } from "@dodi/client-state/game-companion";
import {
  type CapturedSnapshot,
  type GamePlayInfo,
  type GamePlayProps,
  createGamePlaySession,
  playGoal,
} from "@dodi/client-state/game-play";
import { SNAPSHOT_THUMBNAIL } from "@dodi/client-state/snapshots";
import type { GameSaveState } from "@dodi/types/games";
import { type SnapshotFlashRect, gamePlayActions as a, snapshotFlashTarget } from "@dodi/ui-recipes";

import { nativeImageOps } from "@/adapters/image-ops";
import { GameStage } from "@/components/games/game-stage";
import type { GameSandboxHandle } from "@/components/games/game-sandbox";
import { KidButton } from "@/components/kid/kid-button";
import { kidShadowStyle } from "@/components/kid/kid-shadow";
import { KidText } from "@/components/kid/kid-text";
import { Icon } from "@/components/ui";
import { useVaultStore } from "@/lib/client-state";
import { cn } from "@/lib/cn";
import { useDodiSessionStore } from "@/lib/dodi-session-store";
import { gameGenerators } from "@/lib/game-generators";
import { gamePlayDeps } from "@/lib/game-play-deps";
import { measureKidNavItem } from "@/lib/kid-nav-rects";
import { clearSnapshotFlash, showSnapshotFlash } from "@/lib/snapshot-flash-store";
import { useDodiContext } from "@/lib/use-dodi-context";

import { GameViewShell } from "./game-view-shell";

interface GamePlayViewProps extends GamePlayProps {
  kidId: string;
}

/**
 * A kid playing a game or a snapshot (web: components/games/game-play-view),
 * phone layout: title bar with the photo + reset buttons, the error banner,
 * the 4:5 stage. Progress/success, play tracking, the autosave slot and
 * snapshot capture → seal → save run in the shared play session
 * (`@dodi/client-state/game-play`); dodi's side of the play (its game
 * commands, drawings, texts, read-alouds, snapshots) in the shared game
 * companion (`@dodi/client-state/game-companion`). This view holds UI state
 * only.
 */
export function GamePlayView({ kidId, ...game }: GamePlayViewProps) {
  const t = useTranslations("games");
  const tSnapshots = useTranslations("snapshots");
  // In the kid view this is the kid's language.
  const locale = useLocale();
  const {
    gameId,
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
  } = game;

  // Declare dodi's context for this game (or snapshot session).
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

  const updateGameState = useDodiSessionStore((s) => s.updateGameState);
  const setOnRunCommands = useDodiSessionStore((s) => s.setOnRunCommands);
  const setOnRequestSnapshot = useDodiSessionStore((s) => s.setOnRequestSnapshot);
  const resetGameAssistance = useDodiSessionStore((s) => s.resetGameAssistance);

  const sandboxRef = useRef<GameSandboxHandle | null>(null);
  const stageRef = useRef<View | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);

  const goal = useMemo(
    () => playGoal({ progressKind, successCriteria, learningGoal, successDefinition }),
    [progressKind, successCriteria, learningGoal, successDefinition],
  );
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
    [gameId, kidId, title, description, codeBundle, markdown, capabilities, drawingStyle, goal, snapshot, inlineContext],
  );

  // One session per mounted view, kept on the current props (before the
  // play/autosave effects below run) and on this view's handlers.
  const [playSession] = useState(() => createGamePlaySession(gamePlayDeps(), playInfo));
  useEffect(() => {
    playSession.update(playInfo);
  }, [playSession, playInfo]);

  // dodi's side of the play, kept on the current props like the session.
  const [companion] = useState(() =>
    createGameCompanion({ session: useDodiSessionStore, generators: gameGenerators }, playInfo),
  );
  useEffect(() => {
    companion.update(playInfo);
  }, [companion, playInfo]);

  // A capture of the game surface: the game's own first (best for canvas
  // games), the shim as fallback (analyze_game_state, snapshot thumbnails).
  const requestSnapshot = useCallback(
    (): Promise<string | null> =>
      sandboxRef.current?.requestSnapshot({ preferGameCapture: true }) ?? Promise.resolve(null),
    [],
  );

  useEffect(() => {
    playSession.setHost({
      sandbox: () => sandboxRef.current,
      // The host-observed "asking dodi" count joins the success metrics.
      assistanceCount: () => useDodiSessionStore.getState().gameAssistanceCount,
      captureImage: requestSnapshot,
      thumbnail: (dataUrl) => nativeImageOps.downscale(dataUrl, SNAPSHOT_THUMBNAIL),
      unknownCommandError: () => t("unknownCommandError"),
      onGameError: setGameError,
      onGameTextRequest: (request) => companion.handleGameTextRequest(request),
      onGameVoiceRequest: (text) => companion.handleGameVoiceRequest(text),
    });
  }, [playSession, companion, requestSnapshot, t]);

  const handleStateChange = useCallback(
    (state: Record<string, unknown>) => {
      // dodi's view of the game (read_game_state, deferred tool answers).
      updateGameState(state);
      // Progress + the debounced autosave (games push state after each interaction).
      playSession.handleState(state);
    },
    [updateGameState, playSession],
  );

  // A play record from mount to unmount (none for snapshot sessions); each
  // play counts the kid's questions to dodi afresh.
  useEffect(() => {
    resetGameAssistance();
    return playSession.beginPlay();
  }, [gameId, kidId, isSnapshotSession, resetGameAssistance, playSession]);

  // ── Autosave: restore the kid's resume slot before the stage mounts ─────
  const vaultSession = useVaultStore((s) => s.session);
  const vaultStatus = useVaultStore((s) => s.status);
  const [autosave, setAutosave] = useState<{ checked: boolean; savedState?: GameSaveState }>(() => ({
    checked: isSnapshotSession,
  }));
  const autosaveCheckedRef = useRef(isSnapshotSession);

  useEffect(() => {
    if (autosaveCheckedRef.current) return;
    if (!vaultSession) {
      // The kid view unlocks the vault silently; if it settles locked
      // anyway, start fresh rather than withholding the game.
      // Deferred off the synchronous effect tick (set-state-in-effect).
      if (vaultStatus === "locked" || vaultStatus === "needs-setup") {
        autosaveCheckedRef.current = true;
        void Promise.resolve().then(() => setAutosave({ checked: true }));
      }
      return;
    }
    let isCurrent = true;
    void playSession.loadAutosave(vaultSession).then((savedState) => {
      if (!isCurrent) return;
      autosaveCheckedRef.current = true;
      setAutosave({ checked: true, savedState });
    });
    return () => {
      isCurrent = false;
    };
  }, [kidId, gameId, vaultSession, vaultStatus, playSession]);

  // ── Reset: remount the sandbox with no saved state; the fresh state
  // autosaves over the slot so the reset survives a restart.
  const [resetNonce, setResetNonce] = useState(0);
  const resetGame = useCallback(() => {
    setGameError(null);
    setAutosave({ checked: true });
    setResetNonce((nonce) => nonce + 1);
    playSession.restartFresh();
  }, [playSession]);

  useEffect(() => () => playSession.dispose(), [playSession]);

  // iOS-screenshot-style feedback: the capture shrinks from the stage into a
  // small card above the Snapshots nav item (see SnapshotFlash). Everything the
  // flash needs is decided here, before it shows: the stage and nav rects and
  // the reduced-motion setting (fixed for the flash's life). It renders in the
  // kid chrome's full-window SnapshotFlashHost, since it lands outside this view.
  const flashIdRef = useRef<number | null>(null);
  const triggerSnapshotFlash = useCallback((content: CapturedSnapshot) => {
    const image = content.rawSnapshot ?? content.info.thumbnail;
    const stage = stageRef.current;
    if (!image || !stage) return;
    const stageRect = new Promise<SnapshotFlashRect>((resolve) => {
      stage.measureInWindow((left, top, width, height) => resolve({ left, top, width, height }));
    });
    void Promise.all([
      stageRect,
      measureKidNavItem("/snapshots"),
      AccessibilityInfo.isReduceMotionEnabled().catch(() => false),
    ]).then(([startRect, navItem, isReducedMotion]) => {
      const target = snapshotFlashTarget(navItem, Dimensions.get("window"));
      flashIdRef.current = showSnapshotFlash({ image, startRect, target, isReducedMotion });
    });
  }, []);

  // Like the web's flash (part of the game view), it goes when the view goes.
  useEffect(
    () => () => {
      if (flashIdRef.current !== null) clearSnapshotFlash(flashIdRef.current);
    },
    [],
  );

  // The view around the companion: sandbox access, the snapshot flows (with
  // the flash), the error banner and the kid-facing failure texts.
  useEffect(() => {
    companion.setHost({
      sandbox: () => sandboxRef.current,
      saveSnapshot: (requestedTitle) => playSession.saveSnapshot({ requestedTitle, onCaptured: triggerSnapshotFlash }),
      shareSnapshot: (friendName, requestedTitle) =>
        playSession.shareSnapshot({ friendName, requestedTitle, onCaptured: triggerSnapshotFlash }),
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

  // dodi's commands (voice tool calls, text markers) and its snapshot requests.
  useEffect(() => {
    setOnRunCommands(companion.runCommands);
    setOnRequestSnapshot(requestSnapshot);
    return () => {
      setOnRunCommands(null);
      setOnRequestSnapshot(null);
    };
  }, [companion, requestSnapshot, setOnRunCommands, setOnRequestSnapshot]);

  // ── Title-bar photo button (the button variant of `save_snapshot`) ─────
  // Safe without a pending voice tool call: the release no-ops then.
  const [isSavingSnapshot, setIsSavingSnapshot] = useState(false);
  const handlePhotoButton = useCallback(async () => {
    if (isSavingSnapshot) return;
    setIsSavingSnapshot(true);
    try {
      await companion.saveSnapshot();
    } finally {
      setIsSavingSnapshot(false);
    }
  }, [isSavingSnapshot, companion]);

  const actions = isSnapshotSession ? undefined : (
    <View className={a.row}>
      <KidButton
        variant="ghost"
        size="none"
        onPress={() => void handlePhotoButton()}
        disabled={isSavingSnapshot || !autosave.checked}
        accessibilityLabel={t("snapshotButton")}
        hitSlop={4}
        className={cn(a.photo, "active:bg-primary-soft")}
        style={kidShadowStyle("sm")}
      >
        <Icon name="camera" size={a.icon.size} stroke={a.icon.stroke} color="ink-2" />
        <KidText className={a.photoText}>{t("snapshotButton")}</KidText>
      </KidButton>
      <View className={a.divider} />
      <KidButton
        variant="icon"
        size="none"
        onPress={resetGame}
        disabled={!autosave.checked}
        accessibilityLabel={t("resetGame")}
        hitSlop={4}
        className={cn(a.reset, "active:bg-danger-soft")}
        style={kidShadowStyle("sm")}
      >
        <Icon name="delete" size={a.icon.size} stroke={a.icon.stroke} color="danger" />
      </KidButton>
    </View>
  );

  return (
    <View className="relative">
      <GameViewShell
        backHref={snapshot ? "/snapshots" : "/games"}
        backLabel={snapshot ? tSnapshots("title") : t("title")}
        title={title}
        action={actions}
      >
        {gameError ? (
          <View className={a.error} accessibilityRole="alert">
            <KidText className={a.errorText}>
              {t("gameCommandFailedLabel")}: {gameError}
            </KidText>
          </View>
        ) : null}

        {/* The stage mounts only after the autosave slot was checked, so the
            sandbox init already carries the restored state. */}
        {autosave.checked ? (
          <View ref={stageRef} collapsable={false}>
            <GameStage
              key={resetNonce}
              sandboxRef={sandboxRef}
              gameId={gameId}
              codeBundle={codeBundle}
              goal={goal}
              savedState={snapshot?.savedState ?? autosave.savedState}
              locale={locale}
              onStateChange={handleStateChange}
              onCommandResult={handleStateChange}
              onProgress={playSession.handleProgress}
              onMessage={playSession.handleMessage}
            />
          </View>
        ) : null}
      </GameViewShell>
    </View>
  );
}
