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
import { Icon } from "@/components/shared/icon";
import { KidButton } from "@/components/kid/kid-button";
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
  }, [gameId, kidId, isSnapshotSession, resetGameAssistance, patchPlay]);

  const logEvent = useCallback(async (event: string, message: string) => {
    if (isSnapshotSession) return;
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
  }, [t, handleGenerateDrawing, handleSaveSnapshot, handleShareSnapshot]);

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
  }, [logEvent, t]);

  return (
    <GameViewShell
      backHref={snapshot ? "/snapshots" : "/games"}
      backLabel={snapshot ? tSnapshots("title") : t("title")}
      title={title}
      description={description}
      action={
        isSnapshotSession ? undefined : (
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
