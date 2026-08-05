"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  type GameProgressUpdate,
  type GameSandboxHandle,
} from "@/components/games/game-sandbox";
import { GameStage } from "@/components/games/game-stage";
import { GameViewShell } from "@/components/games/game-view-shell";
import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
import type { GameAssistantAction } from "@/components/dodi/dodi-full-game";
import { useOnline } from "@/hooks/use-online";
import {
  finalizePlay,
  logGameEvent,
  recordPlayPatch,
  startPlay as startTrackedPlay,
} from "@/lib/games/play-sync";
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
import {
  generateGameText,
  NoThinkingModelError,
} from "@/lib/ai/client-generate-text";
import { parseContentSlots } from "@dodi/ai/game-content";
import { downscaleDataUrl } from "@/lib/games/thumbnail";
import {
  createOwnSnapshot,
  decodeSnapshotPayload,
  fetchAutosaveSnapshot,
  resolveFriendForShare,
  shareSnapshotWithFriend,
  upsertAutosaveSnapshot,
} from "@/lib/snapshots";
import { SnapshotFlash } from "@/components/snapshots/snapshot-flash";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import {
  estimateSnapshotPayloadBytes,
  sealOwnSnapshotInfo,
  sealOwnSnapshotPayload,
  sealSnapshotForFriend,
} from "@dodi/protocol";
import type {
  DodiProgressState,
  DrawingStyle,
  GameCommand,
  GameGoal,
  GameSaveState,
  GameToParentMessage,
  SnapshotInfoV1,
  SnapshotPayloadV1,
} from "@dodi/types/games";

/** Quiet period after the last game interaction before the autosave uploads. */
const AUTOSAVE_DEBOUNCE_MS = 1500;
/** E2EE-internal marker title — autosave slots never appear in the collection. */
const AUTOSAVE_TITLE = "Autosave";
/**
 * Caps for game-initiated text generation (game:event "request_generate_text").
 * The requesting code is sealed, AI-generated game code — treat it as untrusted
 * and never let it spend AI tokens unbounded. Dodi-initiated calls are gated by
 * the conversation itself and bypass these.
 */
const GAME_TEXT_REQUEST_MAX_PER_PLAY = 20;
const GAME_TEXT_REQUEST_COOLDOWN_MS = 5000;
/**
 * Caps for game-initiated voice requests (game:event "request_generate_voice").
 * Same rationale as the text caps: the requesting code is untrusted. Each
 * request occupies the live voice session for one spoken line, so the cooldown
 * roughly matches how long dodi takes to say one. Only requests that actually
 * reach the session count against the per-play cap.
 */
const GAME_VOICE_REQUEST_MAX_PER_PLAY = 30;
const GAME_VOICE_REQUEST_COOLDOWN_MS = 4000;
/** Longest text a game may have dodi read aloud in one request. */
const GAME_VOICE_TEXT_MAX_CHARS = 400;

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
  const saveStateResolverRef = useRef<((state: GameSaveState | null) => void) | null>(null);
  const [gameError, setGameError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ image: string; startRect: DOMRect } | null>(
    null,
  );
  // Kept current via effect below so the state-change handlers can schedule
  // autosaves without depending on the late-defined debounce callback.
  const scheduleAutosaveRef = useRef<() => void>(() => {});

  const chatSubmitting = useDodiSessionStore((s) => s.chatSubmitting);
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

  // Play tracking goes through the play-sync outbox: recording is synchronous
  // (localStorage), the upload is debounced/queued and survives offline.
  // Persistence must never block gameplay.

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
        if (playIdRef.current) {
          recordPlayPatch(playIdRef.current, {
            succeeded: true,
            finalProgress: progress,
            metrics: merged,
          });
        }
      }
    },
    [goal],
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
      // Games push state after each interaction (e.g. a finished stroke).
      scheduleAutosaveRef.current();
    },
    [updateGameState, ingestDodiState],
  );

  const handleCommandResult = useCallback((state: Record<string, unknown>) => {
    updateGameState(state);
    ingestDodiState(state);
    scheduleAutosaveRef.current();
  }, [updateGameState, ingestDodiState]);

  // Start a game_plays record on mount; finalize it on unmount. Snapshot
  // sessions record no play — `gameId` may reference a deleted or foreign game.
  const isSnapshotSession = !!snapshot;
  useEffect(() => {
    resetGameAssistance();
    succeededRef.current = false;
    latestMetricsRef.current = {};
    latestProgressRef.current = 0;
    if (isSnapshotSession) return;

    // Synchronous: the id is client-generated, so tracking works offline and
    // later patches can never no-op on a failed start.
    playIdRef.current = startTrackedPlay({ gameId, kidId });

    return () => {
      const playId = playIdRef.current;
      playIdRef.current = null;
      if (!playId) return;
      const dodiTurns = useDodiSessionStore.getState().gameAssistanceCount;
      const merged = mergeMetrics(latestMetricsRef.current, { dodiTurns });
      // The synchronous outbox write replaces the old `keepalive` fetch: on a
      // page teardown the record persists and syncs on the next visit.
      finalizePlay(playId, {
        finalProgress: latestProgressRef.current,
        metrics: merged,
      });
    };
  }, [gameId, kidId, isSnapshotSession, resetGameAssistance]);

  const logEvent = useCallback(async (event: string, message: string) => {
    if (isSnapshotSession) return;
    logGameEvent({ gameId, kidId, event, message });
  }, [gameId, kidId, isSnapshotSession]);

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
        const dataUrl = await generateDrawing(subject, drawingStyle);
        sandboxRef.current?.sendCommand({
          type: "set_generated_image",
          payload: { dataUrl },
        });
        // Picture is on the canvas → release the held-open voice tool call so
        // Dodi announces it (she stayed silent while it generated). No-op if the
        // drawing wasn't triggered by a voice tool call.
        useDodiSessionStore.getState().resolveClientCommand({ ok: true });
      } catch (error) {
        gameDebugWarn("playview", "generate_drawing failed:", error);
        const message =
          error instanceof NoImageModelError
            ? t("noImageModel")
            : t("drawingFailed");
        setGameError(message);
        useDodiSessionStore
          .getState()
          .resolveClientCommand({ ok: false, error: message });
      } finally {
        endAiActivity("image");
      }
    },
    [t, beginAiActivity, endAiActivity, drawingStyle],
  );

  // `generate_text` is a client-only meta-command like `generate_drawing`: text
  // generation needs the vault-held thinking key and can't run inside the
  // sandbox. We fill the game's declared content slots (state.contentSlots) in
  // one coherent generation, then push a `set_generated_text` command with the
  // slot map into the sandbox. Triggered by dodi (voice/text tool call) or by
  // the game itself via game:event "request_generate_text" (rate-limited; on
  // any failure the game receives set_generated_text { slots: {}, error } so
  // its loading UI can recover).
  const textGenerationBusyRef = useRef(false);
  const gameTextRequestCountRef = useRef(0);
  const lastGameTextRequestAtRef = useRef(0);

  const deliverTextFailure = useCallback((error: string): void => {
    sandboxRef.current?.sendCommand({
      type: "set_generated_text",
      payload: { slots: {}, error },
    });
  }, []);

  const handleGenerateText = useCallback(
    async (
      command: GameCommand,
      opts?: { isGameRequested?: boolean },
    ): Promise<void> => {
      const isGameRequested = opts?.isGameRequested === true;
      const store = useDodiSessionStore.getState();

      if (textGenerationBusyRef.current) {
        // One generation at a time — the in-flight result lands shortly.
        if (isGameRequested) return;
        store.resolveClientCommand({
          ok: false,
          error:
            "New text is already being written for this game. In one short sentence, ask the child to wait a moment.",
        });
        return;
      }
      if (isGameRequested) {
        const now = Date.now();
        if (
          gameTextRequestCountRef.current >= GAME_TEXT_REQUEST_MAX_PER_PLAY ||
          now - lastGameTextRequestAtRef.current < GAME_TEXT_REQUEST_COOLDOWN_MS
        ) {
          gameDebugWarn("playview", "request_generate_text denied (rate limit)");
          deliverTextFailure("rate_limited");
          return;
        }
        gameTextRequestCountRef.current += 1;
        lastGameTextRequestAtRef.current = now;
      }

      const request =
        typeof command.payload?.request === "string" ? command.payload.request : "";
      const ctx = store.context;
      const slots = ctx.type === "game" ? parseContentSlots(ctx.gameState) : [];
      if (slots.length === 0) {
        // Not an app failure: the game declares no fillable slots right now.
        if (isGameRequested) {
          deliverTextFailure("no_slots");
          return;
        }
        store.resolveClientCommand({
          ok: false,
          error:
            "This game has no text slots to fill right now, so no text was written. " +
            "In one short sentence, gently tell the child this game cannot take new text at the moment.",
        });
        return;
      }

      setGameError(null);
      textGenerationBusyRef.current = true;
      beginAiActivity("writing");
      try {
        const generated = await generateGameText({
          kidId,
          gameId: isSnapshotSession ? null : gameId,
          request,
          slots,
          gameTitle: inlineContext?.title ?? title,
          gameDescription: inlineContext?.description ?? description,
        });
        sandboxRef.current?.sendCommand({
          type: "set_generated_text",
          payload: { slots: generated },
        });
        // Content is in the game → release the held-open voice tool call so
        // dodi announces it. Game-requested runs skip this: a no-op for text
        // chat, but it must never resolve an unrelated pending voice call.
        if (!isGameRequested) {
          useDodiSessionStore.getState().resolveClientCommand({
            ok: true,
            message:
              "The new text is now in the game. In ONE short, cheerful sentence, tell the child it is ready — do not repeat yourself.",
          });
        }
      } catch (error) {
        gameDebugWarn("playview", "generate_text failed:", error);
        const isMissingModel = error instanceof NoThinkingModelError;
        const message = isMissingModel
          ? t("noThinkingModel")
          : t("textGenerationFailed");
        setGameError(message);
        if (isGameRequested) {
          deliverTextFailure(isMissingModel ? "no_thinking_model" : "generation_failed");
        } else {
          useDodiSessionStore
            .getState()
            .resolveClientCommand({ ok: false, error: message });
        }
      } finally {
        textGenerationBusyRef.current = false;
        endAiActivity("writing");
      }
    },
    [
      t,
      kidId,
      gameId,
      isSnapshotSession,
      title,
      description,
      inlineContext,
      beginAiActivity,
      endAiActivity,
      deliverTextFailure,
    ],
  );

  // `generate_voice` is a host-handled meta-command: the game asks dodi to read
  // a short text aloud, and the session store injects a read-aloud turn into
  // the LIVE voice session (same voice, same persona — no separate TTS
  // pipeline). Game-initiated via game:event "request_generate_voice",
  // rate-limited like generate_text. The game always receives a
  // `set_generated_voice` result: { ok: true } when dodi is about to speak, or
  // { ok: false, error } (voice_unavailable when she is muted/asleep/offline,
  // rate_limited, empty_text) so its speaking indicator can recover.
  const gameVoiceRequestCountRef = useRef(0);
  const lastGameVoiceRequestAtRef = useRef(0);

  const handleGenerateVoice = useCallback((command: GameCommand): void => {
    const deliver = (payload: { ok: boolean; error?: string }): void => {
      sandboxRef.current?.sendCommand({ type: "set_generated_voice", payload });
    };

    const text =
      typeof command.payload?.text === "string" ? command.payload.text.trim() : "";
    if (!text) {
      deliver({ ok: false, error: "empty_text" });
      return;
    }
    const now = Date.now();
    if (
      gameVoiceRequestCountRef.current >= GAME_VOICE_REQUEST_MAX_PER_PLAY ||
      now - lastGameVoiceRequestAtRef.current < GAME_VOICE_REQUEST_COOLDOWN_MS
    ) {
      gameDebugWarn("playview", "request_generate_voice denied (rate limit)");
      deliver({ ok: false, error: "rate_limited" });
      return;
    }

    const result = useDodiSessionStore
      .getState()
      .speakGameVoiceText(text.slice(0, GAME_VOICE_TEXT_MAX_CHARS));
    if (!result.ok) {
      // Not an app failure — dodi is muted, asleep, or disconnected. The game
      // must stay playable without voice, so no error banner.
      deliver({ ok: false, error: result.error });
      return;
    }
    gameVoiceRequestCountRef.current += 1;
    lastGameVoiceRequestAtRef.current = now;
    deliver({ ok: true });
  }, []);

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

  // Request the game's full restorable serialization (dodi:get_save_state →
  // game:save_state), resolved in handleSandboxMessage. Null on timeout.
  const requestSaveState = useCallback((): Promise<GameSaveState | null> => {
    return new Promise<GameSaveState | null>((resolve) => {
      if (!sandboxRef.current) {
        resolve(null);
        return;
      }
      sandboxRef.current.requestSaveState();
      const timer = setTimeout(() => {
        if (saveStateResolverRef.current === wrapped) {
          saveStateResolverRef.current = null;
          resolve(null);
        }
      }, 5000);
      const wrapped = (state: GameSaveState | null) => {
        clearTimeout(timer);
        resolve(state);
      };
      saveStateResolverRef.current = wrapped;
    });
  }, []);

  // ── Autosave: one hidden resume slot per kid + game ─────────────────────
  // Each game interaction (state push from the sandbox) schedules a debounced
  // upload of the full serialization into the slot; on open the slot is
  // restored so the kid continues where they left off. Snapshot sessions
  // restore their own savedState and never autosave.
  const vaultSession = useVaultStore((s) => s.session);
  const vaultStatus = useVaultStore((s) => s.status);
  const [autosave, setAutosave] = useState<{
    checked: boolean;
    savedState?: GameSaveState;
  }>(() => ({ checked: isSnapshotSession }));
  const autosaveCheckedRef = useRef(isSnapshotSession);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveBusyRef = useRef(false);
  const autosaveDirtyRef = useRef(false);
  /** Serialized last-uploaded state — skips no-op uploads (incl. right after restore). */
  const lastAutosavedRef = useRef<string | null>(null);

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
      let savedState: GameSaveState | undefined;
      try {
        const detail = await fetchAutosaveSnapshot(kidId, gameId);
        if (detail) {
          const { payload } = decodeSnapshotPayload(detail, vaultSession, null);
          savedState = payload.savedState;
          lastAutosavedRef.current = JSON.stringify(payload.savedState);
        }
      } catch (error) {
        // Unreadable slot → play fresh; the next autosave overwrites it.
        gameDebugWarn("playview", "autosave restore failed:", error);
      }
      if (cancelled) return;
      autosaveCheckedRef.current = true;
      setAutosave({ checked: true, savedState });
    })();
    return () => {
      cancelled = true;
    };
  }, [kidId, gameId, vaultSession, vaultStatus]);

  const runAutosave = useCallback(async (): Promise<void> => {
    if (autosaveBusyRef.current) {
      autosaveDirtyRef.current = true;
      return;
    }
    if (saveStateResolverRef.current) {
      // The save-state channel is serving a manual snapshot — try again
      // after another debounce period.
      scheduleAutosaveRef.current();
      return;
    }
    autosaveBusyRef.current = true;
    try {
      const session = useVaultStore.getState().session;
      if (!session) return;
      const savedState = await requestSaveState();
      if (!savedState) return;
      const serialized = JSON.stringify(savedState);
      if (serialized === lastAutosavedRef.current) return;
      const createdAt = new Date().toISOString();
      const info: SnapshotInfoV1 = {
        v: 1,
        title: AUTOSAVE_TITLE,
        gameTitle: title,
        thumbnail: null,
        createdAt,
      };
      const payload: SnapshotPayloadV1 = {
        v: 1,
        title: AUTOSAVE_TITLE,
        createdAt,
        gameId,
        gameTitle: title,
        gameDescription: description,
        gameMarkdown: markdown,
        codeBundle,
        capabilities,
        drawingStyle,
        savedState,
      };
      await upsertAutosaveSnapshot({
        kidId,
        gameId,
        infoEnc: sealOwnSnapshotInfo(session, info),
        payloadEnc: sealOwnSnapshotPayload(session, payload),
        payloadBytes: estimateSnapshotPayloadBytes(payload),
      });
      lastAutosavedRef.current = serialized;
    } catch (error) {
      // Autosave must never disturb gameplay — the next interaction retries.
      gameDebugWarn("playview", "autosave failed:", error);
    } finally {
      autosaveBusyRef.current = false;
      if (autosaveDirtyRef.current) {
        autosaveDirtyRef.current = false;
        scheduleAutosaveRef.current();
      }
    }
  }, [
    kidId,
    gameId,
    title,
    description,
    markdown,
    codeBundle,
    capabilities,
    drawingStyle,
    requestSaveState,
  ]);

  const scheduleAutosave = useCallback((): void => {
    if (isSnapshotSession) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      autosaveTimerRef.current = null;
      void runAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }, [isSnapshotSession, runAutosave]);

  // ── Reset: remount the sandbox with no saved state ──────────────────────
  // Host-level and game-agnostic — the game boots exactly as on first open.
  // The fresh state then flows through the regular autosave pipeline (the
  // ready-state push plus the direct schedule below), overwriting the slot so
  // the reset survives a reload.
  const [resetNonce, setResetNonce] = useState(0);
  const handleResetGame = useCallback((): void => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    lastAutosavedRef.current = null;
    setGameError(null);
    setAutosave({ checked: true });
    setResetNonce((nonce) => nonce + 1);
    scheduleAutosaveRef.current();
  }, []);

  useEffect(() => {
    scheduleAutosaveRef.current = scheduleAutosave;
  }, [scheduleAutosave]);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, []);

  // Capture the full save state + a downscaled thumbnail and build the two
  // snapshot blobs' plaintext (plus the raw full-size capture for the flash
  // animation). Null when the game didn't answer.
  const captureSnapshotContent = useCallback(
    async (
      snapshotTitle: string,
    ): Promise<{
      info: SnapshotInfoV1;
      payload: SnapshotPayloadV1;
      rawSnapshot: string | null;
    } | null> => {
      const savedState = await requestSaveState();
      if (!savedState) return null;
      const raw = capabilities.includes("get_snapshot")
        ? await requestSnapshot()
        : null;
      const thumbnail = raw ? await downscaleDataUrl(raw) : null;
      const createdAt = new Date().toISOString();
      const gameTitle = inlineContext?.title ?? title;
      const info: SnapshotInfoV1 = {
        v: 1,
        title: snapshotTitle,
        gameTitle,
        thumbnail,
        createdAt,
      };
      const payload: SnapshotPayloadV1 = {
        v: 1,
        title: snapshotTitle,
        createdAt,
        gameId: snapshot ? snapshot.gameId : gameId,
        gameTitle,
        gameDescription: inlineContext?.description ?? description,
        gameMarkdown: markdown,
        codeBundle,
        capabilities,
        drawingStyle,
        savedState,
      };
      return { info, payload, rawSnapshot: raw };
    },
    [
      requestSaveState,
      requestSnapshot,
      capabilities,
      inlineContext,
      title,
      description,
      markdown,
      codeBundle,
      drawingStyle,
      snapshot,
      gameId,
    ],
  );

  // iOS-screenshot-style feedback: the captured image shrinks from the game
  // stage into a small card above the Snapshots nav item (see SnapshotFlash).
  const triggerSnapshotFlash = useCallback(
    (content: { info: SnapshotInfoV1; rawSnapshot: string | null }): void => {
      const image = content.rawSnapshot ?? content.info.thumbnail;
      const stage = stageCardRef.current;
      if (!image || !stage) return;
      setFlash({ image, startRect: stage.getBoundingClientRect() });
    },
    [],
  );

  // `save_snapshot` / `share_snapshot` are host meta-commands: sealing needs the
  // vault + friend keys, which never enter the sandbox. The voice tool response
  // is held open (resolveClientCommand) so dodi announces the outcome once.
  const handleSaveSnapshot = useCallback(
    async (command: GameCommand): Promise<void> => {
      const store = useDodiSessionStore.getState();
      setGameError(null);
      beginAiActivity("thinking");
      try {
        const session = useVaultStore.getState().session;
        if (!session) throw new Error("vault_locked");
        const requestedTitle =
          typeof command.payload?.title === "string" ? command.payload.title.trim() : "";
        const snapshotTitle =
          requestedTitle ||
          `${inlineContext?.title ?? title} · ${new Date().toLocaleDateString()}`;

        const content = await captureSnapshotContent(snapshotTitle);
        if (!content) throw new Error("no_save_state");
        triggerSnapshotFlash(content);

        await createOwnSnapshot({
          kidId,
          gameId: content.payload.gameId,
          infoEnc: sealOwnSnapshotInfo(session, content.info),
          payloadEnc: sealOwnSnapshotPayload(session, content.payload),
          payloadBytes: estimateSnapshotPayloadBytes(content.payload),
        });
        const { logKidActivity } = await import("@/lib/activities/log-activity");
        logKidActivity({
          kidId,
          event: "snapshot_created",
          message: `Snapshot saved: ${snapshotTitle}`,
        });
        store.resolveClientCommand({
          ok: true,
          message: `The snapshot "${snapshotTitle}" is saved. In ONE short, cheerful sentence, tell the child it's saved in their snapshot collection — do not repeat yourself.`,
        });
      } catch (error) {
        gameDebugWarn("playview", "save_snapshot failed:", error);
        setGameError(t("snapshotSaveFailed"));
        store.resolveClientCommand({
          ok: false,
          error:
            "Saving the snapshot didn't work this time. In one short sentence, gently tell the child.",
        });
      } finally {
        endAiActivity("thinking");
      }
    },
    [kidId, title, inlineContext, captureSnapshotContent, triggerSnapshotFlash, beginAiActivity, endAiActivity, t],
  );

  const handleShareSnapshot = useCallback(
    async (command: GameCommand): Promise<void> => {
      const store = useDodiSessionStore.getState();
      setGameError(null);
      beginAiActivity("thinking");
      try {
        const session = useVaultStore.getState().session;
        if (!session) throw new Error("vault_locked");
        const kid = await useKidStore.getState().loadOne(kidId);
        if (!kid) throw new Error("kid_not_found");

        const friendName =
          typeof command.payload?.friend_name === "string"
            ? command.payload.friend_name
            : "";
        const resolution = await resolveFriendForShare(kid, session, friendName);
        if (resolution.kind !== "ok") {
          const candidates = resolution.candidates.join(", ") || "none";
          store.resolveClientCommand({
            ok: false,
            error:
              resolution.kind === "ambiguous"
                ? `More than one friend matches "${friendName}" (${candidates}). In one short sentence, ask the child which friend they mean.`
                : `No friend named "${friendName}" was found. The child's friends are: ${candidates}. In one short sentence, ask the child which friend they mean.`,
          });
          return;
        }

        const requestedTitle =
          typeof command.payload?.title === "string" ? command.payload.title.trim() : "";
        const snapshotTitle =
          requestedTitle ||
          `${inlineContext?.title ?? title} · ${new Date().toLocaleDateString()}`;

        const content = await captureSnapshotContent(snapshotTitle);
        if (!content) throw new Error("no_save_state");
        triggerSnapshotFlash(content);

        // Share implies save: the kid keeps their own copy, marked with the
        // recipient so the parent view can list it under "Sent"…
        await createOwnSnapshot({
          kidId,
          gameId: content.payload.gameId,
          infoEnc: sealOwnSnapshotInfo(session, content.info),
          payloadEnc: sealOwnSnapshotPayload(session, content.payload),
          payloadBytes: estimateSnapshotPayloadBytes(content.payload),
          sharedWithKidId: resolution.counterpartKidId,
        });
        // …and the friend gets a self-contained copy sealed to their keys. The
        // payload and row keep the sender's gameId as a soft reference.
        const { infoEnvelope, payloadEnvelope } = sealSnapshotForFriend(
          resolution.kemPublicKey,
          content.info,
          content.payload,
          resolution.myKeys.sign,
        );
        await shareSnapshotWithFriend({
          senderKidId: kidId,
          friendshipId: resolution.friendshipId,
          gameId: content.payload.gameId,
          infoEnc: infoEnvelope,
          payloadEnc: payloadEnvelope,
          payloadBytes: estimateSnapshotPayloadBytes(content.payload),
        });
        const { logKidActivity } = await import("@/lib/activities/log-activity");
        logKidActivity({
          kidId,
          event: "snapshot_shared",
          message: `Snapshot shared with ${resolution.displayName}: ${snapshotTitle}`,
        });
        store.resolveClientCommand({
          ok: true,
          message: `The snapshot "${snapshotTitle}" was sent to ${resolution.displayName} and saved in the child's own collection. In ONE short, cheerful sentence, tell the child — do not repeat yourself.`,
        });
      } catch (error) {
        gameDebugWarn("playview", "share_snapshot failed:", error);
        setGameError(t("snapshotShareFailed"));
        store.resolveClientCommand({
          ok: false,
          error:
            "Sharing the snapshot didn't work this time. In one short sentence, gently tell the child.",
        });
      } finally {
        endAiActivity("thinking");
      }
    },
    [kidId, title, inlineContext, captureSnapshotContent, triggerSnapshotFlash, beginAiActivity, endAiActivity, t],
  );

  // ── Title-bar photo button + Dodi panel quick actions ─────────────────────
  const isOnline = useOnline();
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  // The button variant of the `save_snapshot` voice command. Safe to call
  // without a pending voice tool call: resolveClientCommand no-ops then.
  const handlePhotoButton = useCallback(async (): Promise<void> => {
    if (savingSnapshot) return;
    setSavingSnapshot(true);
    try {
      await handleSaveSnapshot({ type: "save_snapshot" });
    } finally {
      setSavingSnapshot(false);
    }
  }, [savingSnapshot, handleSaveSnapshot]);

  // Contextual chips in the Dodi panel. The photo chip runs the capture
  // directly; the rest go through the chat as the kid's own words, so dodi
  // answers (and e.g. asks WHICH friend before emitting share_snapshot) —
  // calling handleShareSnapshot directly would fail silently without a
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
      if (command.type === "generate_text") {
        void handleGenerateText(command);
        continue;
      }
      if (command.type === "generate_voice") {
        // Never a voice tool, but a marker-emitted command from the text
        // assistant could still name it — handle host-side, the sandbox
        // doesn't implement it.
        handleGenerateVoice(command);
        continue;
      }
      if (command.type === "save_snapshot") {
        void handleSaveSnapshot(command);
        continue;
      }
      if (command.type === "share_snapshot") {
        void handleShareSnapshot(command);
        continue;
      }
      gameDebug("playview", `Sending command to sandbox:`, command);
      sandboxRef.current.sendCommand(command);
    }
  }, [t, handleGenerateDrawing, handleGenerateText, handleGenerateVoice, handleSaveSnapshot, handleShareSnapshot]);

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
      const snapshotData = (message.payload as Record<string, unknown>).snapshot as string | null;
      gameDebug("playview", `Received snapshot (${snapshotData ? snapshotData.length : 0} chars)`);
      if (snapshotResolverRef.current) {
        snapshotResolverRef.current(snapshotData ?? null);
        snapshotResolverRef.current = null;
      }
      return;
    }

    // Game-initiated content generation: an in-game button (or game start)
    // posts this event; the host runs the same generate_text flow, gated by
    // the declared capability and the per-play rate limit.
    if (
      message.type === "game:event" &&
      message.payload.event === "request_generate_text"
    ) {
      if (!capabilities.includes("generate_text")) {
        gameDebugWarn(
          "playview",
          "request_generate_text ignored — generate_text capability not declared",
        );
        return;
      }
      const request = (message.payload as Record<string, unknown>).request;
      void handleGenerateText(
        {
          type: "generate_text",
          payload: typeof request === "string" ? { request } : {},
        },
        { isGameRequested: true },
      );
      return;
    }

    // Game-initiated spoken feedback: dodi reads a short game text aloud
    // through the live voice session.
    if (
      message.type === "game:event" &&
      message.payload.event === "request_generate_voice"
    ) {
      if (!capabilities.includes("generate_voice")) {
        gameDebugWarn(
          "playview",
          "request_generate_voice ignored — generate_voice capability not declared",
        );
        return;
      }
      const text = (message.payload as Record<string, unknown>).text;
      handleGenerateVoice({
        type: "generate_voice",
        payload: typeof text === "string" ? { text } : {},
      });
      return;
    }

    // Full restorable serialization, in reply to dodi:get_save_state
    if (message.type === "game:save_state") {
      gameDebug("playview", "Received game:save_state");
      if (saveStateResolverRef.current) {
        saveStateResolverRef.current(message.payload.state as GameSaveState);
        saveStateResolverRef.current = null;
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
  }, [logEvent, t, capabilities, handleGenerateText, handleGenerateVoice]);

  return (
    <GameViewShell
      backHref={snapshot ? "/snapshots" : "/games"}
      backLabel={snapshot ? tSnapshots("title") : t("title")}
      title={title}
      assistantActions={assistantActions}
      action={
        isSnapshotSession ? undefined : (
          <div className="flex shrink-0 items-center gap-4">
            <KidButton
              variant="ghost"
              size="none"
              onClick={() => void handlePhotoButton()}
              disabled={savingSnapshot || !autosave.checked}
              title={t("snapshotButton")}
              aria-label={t("snapshotButton")}
              className="gap-1.5 rounded-[12px] border border-border-strong bg-white px-3 py-2 text-[13.5px] font-extrabold text-ink-2 shadow-sm hover:bg-primary-soft hover:text-primary"
            >
              <Icon name="camera" size={20} stroke={2} />
              {t("snapshotButton")}
            </KidButton>
            <span
              className="h-7 w-px shrink-0 self-center bg-border-strong"
              aria-hidden
            />
            <KidButton
              variant="icon"
              size="none"
              onClick={handleResetGame}
              disabled={!autosave.checked}
              title={t("resetGame")}
              aria-label={t("resetGame")}
              className="rounded-[12px] border border-danger/30 bg-white text-danger shadow-sm hover:bg-danger-soft"
            >
              <Icon name="delete" size={20} stroke={2} />
            </KidButton>
          </div>
        )
      }
    >
      {gameError && (
        <div className="mb-4 rounded-[14px] bg-danger-soft px-3 py-2 text-xs font-semibold text-danger">
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
          onProgress={handleProgress}
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
