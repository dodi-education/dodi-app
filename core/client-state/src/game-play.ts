/**
 * A kid's play session of one game (or one snapshot), without the rendering:
 * progress + success evaluation, play tracking through the play outbox, the
 * hidden autosave slot, the save-state channel to the sandbox, the sandbox
 * message routing and the snapshot capture → seal → save (and share) flows.
 *
 * Web and app create one session per mounted play view and feed it the
 * sandbox's events; the view keeps only UI state (error banner, flash, the
 * stage's reset key). The companion (voice/text assistant) plugs in through
 * {@link GamePlayHost}: its "asked dodi" count joins the success metrics and
 * the game's text/voice requests are handed to it.
 *
 * Games and snapshots are E2EE: snapshot blobs are sealed here on the device
 * (own rows under the vault, shared copies to the friend's KEM key) and only
 * ciphertext leaves it.
 */
import { gameDebug, gameDebugWarn } from "@dodi/games/debug";
import {
  EMPTY_SUCCESS_CRITERIA,
  coerceProgressKind,
  coerceSuccessCriteria,
} from "@dodi/games/game-spec";
import type { GameProgressUpdate } from "@dodi/games/sandbox-host";
import {
  type MetricsSummary,
  type ProgressKind,
  type SuccessCriteria,
  evaluateSuccess,
  isEmptyCriteria,
  mergeMetrics,
} from "@dodi/games/success";
import { sealSnapshotForFriend } from "@dodi/protocol";
import type { Game } from "@dodi/types/database";
import type {
  DodiProgressState,
  DrawingStyle,
  GameGoal,
  GameMetadata,
  GameSaveState,
  GameToParentMessage,
  SnapshotInfoV1,
  SnapshotPayloadV1,
} from "@dodi/types/games";
import type { VaultSession } from "@dodi/vault";

import type { ConnectivityStore } from "./connectivity-store";
import type { GameStore } from "./game-store";
import type { KidStore } from "./kid-store";
import type { KidActivityInput } from "./kid-activity";
import type { PlaySync } from "./play-sync";
import {
  AUTOSAVE_TITLE,
  type DecodedSnapshotPayload,
  type SnapshotDeps,
  buildSnapshotContent,
  createOwnSnapshot,
  decodeSnapshotPayload,
  defaultSnapshotTitle,
  fetchAutosaveSnapshot,
  resolveFriendForShare,
  sealOwnSnapshot,
  shareSnapshotWithFriend,
  upsertAutosaveSnapshot,
} from "./snapshots";
import type { VaultStore } from "./vault-store";

/** Quiet period after the last game interaction before the autosave uploads. */
export const AUTOSAVE_DEBOUNCE_MS = 1500;
/** How long the game may take to answer a save-state request. */
const SAVE_STATE_TIMEOUT_MS = 5000;

/** The goal handed to the game on init: only goal games with real criteria. */
export function playGoal(input: {
  progressKind: ProgressKind;
  successCriteria: SuccessCriteria;
  learningGoal: string;
  successDefinition: string;
}): GameGoal | undefined {
  const { progressKind, successCriteria, learningGoal, successDefinition } = input;
  if (progressKind !== "goal" || isEmptyCriteria(successCriteria)) return undefined;
  return { learningGoal, successDefinition, successCriteria, progressKind };
}

// ----- Opening a game / snapshot for play --------------------------------------------

export type KidGameOpenResult =
  | { kind: "ok"; game: Game }
  | { kind: "missing" }
  /** Offline with no cached copy: the game exists, it just isn't saved for offline. */
  | { kind: "offline-unavailable" };

/**
 * Load a game for the kid. `kidId` makes the platform derive the locale and
 * enforce visibility (inactive/unshared games 404 even via a direct link). The
 * store decrypts the row: everything after this is plaintext on the device.
 */
export async function openKidGame(
  deps: { games: GameStore; connectivity: ConnectivityStore },
  gameId: string,
  kidId: string,
): Promise<KidGameOpenResult> {
  const unavailable = (): KidGameOpenResult =>
    deps.connectivity.getState().isOnline ? { kind: "missing" } : { kind: "offline-unavailable" };
  try {
    const game = await deps.games.getState().loadOne(gameId, kidId);
    return game ? { kind: "ok", game } : unavailable();
  } catch {
    return unavailable();
  }
}

/** The play view's game props, as both clients pass them. */
export interface GamePlayProps {
  gameId: string;
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
  snapshot?: { id: string; savedState: GameSaveState; gameId: string | null };
  inlineContext?: { title: string; description: string };
}

/** Play props of a (decrypted) game row. */
export function gamePlayPropsFromGame(game: Game): GamePlayProps {
  const metadata = game.metadata as unknown as GameMetadata | null;
  return {
    gameId: game.id,
    title: game.title,
    description: game.description,
    codeBundle: game.code_bundle,
    markdown: game.markdown,
    learningGoal: game.learning_goal,
    successDefinition: game.success_definition,
    successCriteria: coerceSuccessCriteria(game.success_criteria),
    progressKind: coerceProgressKind(game.progress_kind),
    capabilities: metadata?.capabilities ?? [],
    drawingStyle: metadata?.drawingStyle ?? "picture",
  };
}

/**
 * Play props of an opened snapshot: the re-sanitized code, the saved state to
 * restore, open-ended progress (no goal) and the game's own title/description
 * as inline context (`title` carries the snapshot's title).
 */
export function gamePlayPropsFromSnapshot(
  snapshotId: string,
  decoded: DecodedSnapshotPayload,
): GamePlayProps {
  const { payload, sanitizedCode } = decoded;
  return {
    gameId: payload.gameId ?? snapshotId,
    title: payload.title,
    description: payload.gameTitle,
    codeBundle: sanitizedCode,
    markdown: payload.gameMarkdown,
    learningGoal: "",
    successDefinition: "",
    successCriteria: EMPTY_SUCCESS_CRITERIA,
    progressKind: "open",
    capabilities: payload.capabilities,
    drawingStyle: payload.drawingStyle,
    snapshot: { id: snapshotId, savedState: payload.savedState, gameId: payload.gameId },
    inlineContext: { title: payload.gameTitle, description: payload.gameDescription },
  };
}

/** What the session reads about the game on every use (the view's current props). */
export interface GamePlayInfo {
  gameId: string;
  kidId: string;
  title: string;
  description: string;
  codeBundle: string;
  markdown: string;
  capabilities: string[];
  drawingStyle: DrawingStyle;
  goal: GameGoal | undefined;
  /**
   * Present when resuming a SNAPSHOT: the saved state plus the original game's
   * soft reference. Snapshot sessions record no plays and never autosave (the
   * game row may be deleted or another family's).
   */
  snapshot?: { id: string; savedState: GameSaveState; gameId: string | null };
  /** Game title/description for snapshot play (`title` then carries the snapshot title). */
  inlineContext?: { title: string; description: string };
}

/** The running sandbox, as far as the session talks to it. */
export interface PlaySandbox {
  notifySuccess(payload?: { summary?: string; metrics?: MetricsSummary }): void;
  requestSaveState(): void;
}

/** The platform view around the session (and the companion seam). */
export interface GamePlayHost {
  /** The mounted sandbox, null before mount / between resets. */
  sandbox(): PlaySandbox | null;
  /** Times the kid asked dodi for help during this play (0 without a companion). */
  assistanceCount(): number;
  /** Capture the game surface as a data URL; null when it can't. */
  captureImage(): Promise<string | null>;
  /** Downscale a capture into a gallery thumbnail; null on failure. */
  thumbnail(dataUrl: string): Promise<string | null>;
  /** The text for a failed command that gave no reason. */
  unknownCommandError(): string;
  /** The error banner: a game/command error, or null to clear it. */
  onGameError(error: string | null): void;
  /** The game asked for generated text (`generate_text` capability declared). */
  onGameTextRequest(request: string | undefined): void;
  /** The game asked dodi to read a text aloud (`generate_voice` capability declared). */
  onGameVoiceRequest(text: string | undefined): void;
}

export interface GamePlayDeps {
  vault: VaultStore;
  kids: KidStore;
  snapshots: SnapshotDeps;
  playSync: Pick<PlaySync, "startPlay" | "recordPlayPatch" | "finalizePlay" | "logGameEvent">;
  /** Fire-and-forget kid activity (snapshot saved / shared). */
  logActivity(input: KidActivityInput): void;
}

/** A capture's plaintext blobs, plus the raw full-size image for the flash. */
export interface CapturedSnapshot {
  info: SnapshotInfoV1;
  payload: SnapshotPayloadV1;
  rawSnapshot: string | null;
}

export type ShareSnapshotOutcome =
  | { kind: "ok"; title: string; displayName: string }
  | { kind: "unknown" | "ambiguous"; candidates: string[] };

export interface GamePlaySession {
  /** The view's current props (read on every use). */
  update(info: GamePlayInfo): void;
  /** The view around the session (sandbox access, companion seam, error banner). */
  setHost(host: GamePlayHost): void;
  /**
   * Start a play: reset the progress state and, unless this is a snapshot
   * session, record a play (synchronous, offline-safe). Returns the cleanup
   * that finalizes it with the last progress and metrics.
   */
  beginPlay(): () => void;
  /** Immediate game:progress updates. */
  handleProgress(update: GameProgressUpdate): void;
  /** State pushes (game:ready/state, command results): progress + autosave. */
  handleState(state: Record<string, unknown>): void;
  /** Every validated sandbox message (errors, save state, results, requests). */
  handleMessage(message: GameToParentMessage): void;
  /** Queue an activity event for this game (never for snapshot sessions). */
  logEvent(event: string, message: string): void;
  /** Ask the game for its restorable serialization; null on timeout. */
  requestSaveState(): Promise<GameSaveState | null>;
  /** True while a save-state request waits for its answer. */
  isSaveStatePending(): boolean;
  /** Restore source: the kid's autosave slot for this game (undefined: start fresh). */
  loadAutosave(session: VaultSession): Promise<GameSaveState | undefined>;
  /** Debounced autosave after an interaction (no-op for snapshot sessions). */
  scheduleAutosave(): void;
  /** Reset to a fresh game: forget the last upload and autosave the fresh state. */
  restartFresh(): void;
  /** Capture save state + thumbnail as the two snapshot blobs; null when the game didn't answer. */
  captureSnapshotContent(title: string): Promise<CapturedSnapshot | null>;
  /**
   * Save a manual snapshot into the kid's collection. `onCaptured` runs between
   * capture and upload (the flash). Rejects (vault_locked / no_save_state /
   * request errors) so the caller can show its failure.
   */
  saveSnapshot(opts?: {
    requestedTitle?: string;
    onCaptured?: (content: CapturedSnapshot) => void;
  }): Promise<{ title: string }>;
  /**
   * Share a snapshot with a friend by name: the kid keeps an own copy marked
   * with the recipient, the friend gets a copy sealed to their keys. Unknown or
   * ambiguous names resolve with the candidates instead of sharing.
   */
  shareSnapshot(opts: {
    friendName: string;
    requestedTitle?: string;
    onCaptured?: (content: CapturedSnapshot) => void;
  }): Promise<ShareSnapshotOutcome>;
  /** Unmount: stop the pending autosave timer. */
  dispose(): void;
}

/** Before the view attached: no sandbox, no companion, errors dropped. */
export const DETACHED_PLAY_HOST: GamePlayHost = {
  sandbox: () => null,
  assistanceCount: () => 0,
  captureImage: async () => null,
  thumbnail: async () => null,
  unknownCommandError: () => "",
  onGameError: () => {},
  onGameTextRequest: () => {},
  onGameVoiceRequest: () => {},
};

/**
 * One session per mounted play view. Create it with the first props, then
 * keep it current: `update` on prop changes (before `beginPlay` /
 * `loadAutosave` run) and `setHost` once the view's handlers exist (before the
 * sandbox mounts).
 */
export function createGamePlaySession(
  deps: GamePlayDeps,
  initialInfo: GamePlayInfo,
  initialHost: GamePlayHost = DETACHED_PLAY_HOST,
): GamePlaySession {
  let currentInfo = initialInfo;
  let host = initialHost;
  const game = (): GamePlayInfo => currentInfo;
  let playId: string | null = null;
  let hasSucceeded = false;
  let latestMetrics: MetricsSummary = {};
  let latestProgress = 0;

  let saveStateResolver: ((state: GameSaveState | null) => void) | null = null;

  let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  let isAutosaveBusy = false;
  let isAutosaveDirty = false;
  /** Serialized last-uploaded state: skips no-op uploads (incl. right after restore). */
  let lastAutosaved: string | null = null;

  const isSnapshotSession = (): boolean => !!game().snapshot;

  // Merge in the host-observed "asking dodi" count, evaluate, and record success.
  function evaluateAndRecord(metrics: MetricsSummary, progress: number): void {
    latestMetrics = metrics;
    latestProgress = progress;
    const { goal } = game();
    if (!goal || hasSucceeded) return;

    const merged = mergeMetrics(metrics, { dodiTurns: host.assistanceCount() });
    const result = evaluateSuccess(goal.successCriteria, merged);
    if (result.succeeded) {
      hasSucceeded = true;
      gameDebug("playview", "Success criteria met", merged);
      host.sandbox()?.notifySuccess({ summary: goal.successDefinition, metrics: merged });
      if (playId) {
        deps.playSync.recordPlayPatch(playId, {
          succeeded: true,
          finalProgress: progress,
          metrics: merged,
        });
      }
    }
  }

  function ingestDodiState(state: Record<string, unknown>): void {
    const dodi = state.dodi as DodiProgressState | undefined;
    if (!dodi || typeof dodi !== "object") return;
    const metrics = { ...latestMetrics, ...(dodi.metrics ?? {}) };
    const progress = typeof dodi.progress === "number" ? dodi.progress : latestProgress;
    evaluateAndRecord(metrics, progress);
  }

  function logEvent(event: string, message: string): void {
    if (isSnapshotSession()) return;
    const { gameId, kidId } = game();
    deps.playSync.logGameEvent({ gameId, kidId, event, message });
  }

  function requestSaveState(): Promise<GameSaveState | null> {
    return new Promise<GameSaveState | null>((resolve) => {
      const sandbox = host.sandbox();
      if (!sandbox) {
        resolve(null);
        return;
      }
      sandbox.requestSaveState();
      const timer = setTimeout(() => {
        if (saveStateResolver === wrapped) {
          saveStateResolver = null;
          resolve(null);
        }
      }, SAVE_STATE_TIMEOUT_MS);
      const wrapped = (state: GameSaveState | null): void => {
        clearTimeout(timer);
        resolve(state);
      };
      saveStateResolver = wrapped;
    });
  }

  function scheduleAutosave(): void {
    if (isSnapshotSession()) return;
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void runAutosave();
    }, AUTOSAVE_DEBOUNCE_MS);
  }

  async function runAutosave(): Promise<void> {
    if (isAutosaveBusy) {
      isAutosaveDirty = true;
      return;
    }
    if (saveStateResolver) {
      // The save-state channel is serving a manual snapshot: try again after
      // another debounce period.
      scheduleAutosave();
      return;
    }
    isAutosaveBusy = true;
    try {
      const session = deps.vault.getState().session;
      if (!session) return;
      const savedState = await requestSaveState();
      if (!savedState) return;
      const serialized = JSON.stringify(savedState);
      if (serialized === lastAutosaved) return;
      const info = game();
      const content = buildSnapshotContent(
        {
          gameId: info.gameId,
          gameTitle: info.title,
          gameDescription: info.description,
          gameMarkdown: info.markdown,
          codeBundle: info.codeBundle,
          capabilities: info.capabilities,
          drawingStyle: info.drawingStyle,
        },
        AUTOSAVE_TITLE,
        savedState,
        null,
      );
      await upsertAutosaveSnapshot(deps.snapshots, {
        kidId: info.kidId,
        gameId: info.gameId,
        ...sealOwnSnapshot(session, content),
      });
      lastAutosaved = serialized;
    } catch (error) {
      // Autosave must never disturb gameplay: the next interaction retries.
      gameDebugWarn("playview", "autosave failed:", error);
    } finally {
      isAutosaveBusy = false;
      if (isAutosaveDirty) {
        isAutosaveDirty = false;
        scheduleAutosave();
      }
    }
  }

  async function captureSnapshotContent(title: string): Promise<CapturedSnapshot | null> {
    const savedState = await requestSaveState();
    if (!savedState) return null;
    const info = game();
    const raw = info.capabilities.includes("get_snapshot") ? await host.captureImage() : null;
    const thumbnail = raw ? await host.thumbnail(raw) : null;
    const content = buildSnapshotContent(
      {
        gameId: info.snapshot ? info.snapshot.gameId : info.gameId,
        gameTitle: info.inlineContext?.title ?? info.title,
        gameDescription: info.inlineContext?.description ?? info.description,
        gameMarkdown: info.markdown,
        codeBundle: info.codeBundle,
        capabilities: info.capabilities,
        drawingStyle: info.drawingStyle,
      },
      title,
      savedState,
      thumbnail,
    );
    return { ...content, rawSnapshot: raw };
  }

  function snapshotTitle(requestedTitle: string | undefined): string {
    const info = game();
    return requestedTitle?.trim() || defaultSnapshotTitle(info.inlineContext?.title ?? info.title);
  }

  return {
    update(next) {
      currentInfo = next;
    },

    setHost(next) {
      host = next;
    },

    beginPlay() {
      hasSucceeded = false;
      latestMetrics = {};
      latestProgress = 0;
      if (isSnapshotSession()) return () => {};

      // Synchronous: the id is client-generated, so tracking works offline and
      // later patches can never no-op on a failed start.
      const { gameId, kidId } = game();
      playId = deps.playSync.startPlay({ gameId, kidId });

      return () => {
        const ended = playId;
        playId = null;
        if (!ended) return;
        const merged = mergeMetrics(latestMetrics, { dodiTurns: host.assistanceCount() });
        // The synchronous outbox write is the teardown persistence: the record
        // syncs on the next flush.
        deps.playSync.finalizePlay(ended, { finalProgress: latestProgress, metrics: merged });
      };
    },

    handleProgress(update) {
      const metrics = { ...latestMetrics, ...(update.metrics ?? {}) };
      evaluateAndRecord(metrics, update.progress);
    },

    handleState(state) {
      ingestDodiState(state);
      // Games push state after each interaction (e.g. a finished stroke).
      scheduleAutosave();
    },

    handleMessage(message) {
      if (message.type === "game:error") {
        gameDebugWarn("playview", `Game error: ${message.payload.error}`);
        host.onGameError(message.payload.error);
        return;
      }

      // Game-initiated content generation: an in-game button (or game start)
      // posts this event; gated by the declared capability.
      if (message.type === "game:event" && message.payload.event === "request_generate_text") {
        if (!game().capabilities.includes("generate_text")) {
          gameDebugWarn("playview", "request_generate_text ignored: generate_text capability not declared");
          return;
        }
        const request = (message.payload as Record<string, unknown>).request;
        host.onGameTextRequest(typeof request === "string" ? request : undefined);
        return;
      }

      // Game-initiated spoken feedback: dodi reads a short game text aloud.
      if (message.type === "game:event" && message.payload.event === "request_generate_voice") {
        if (!game().capabilities.includes("generate_voice")) {
          gameDebugWarn("playview", "request_generate_voice ignored: generate_voice capability not declared");
          return;
        }
        const text = (message.payload as Record<string, unknown>).text;
        host.onGameVoiceRequest(typeof text === "string" ? text : undefined);
        return;
      }

      // Full restorable serialization, in reply to dodi:get_save_state.
      if (message.type === "game:save_state") {
        gameDebug("playview", "Received game:save_state");
        if (saveStateResolver) {
          saveStateResolver(message.payload.state as GameSaveState);
          saveStateResolver = null;
        }
        return;
      }

      if (message.type === "game:result") {
        const commandType = message.payload.command.type;
        if (message.payload.result.ok) {
          gameDebug("playview", `Command succeeded: ${commandType}`);
          host.onGameError(null);
          logEvent("game_command_executed", `Executed command: ${commandType}`);
        } else {
          const error = message.payload.result.error ?? host.unknownCommandError();
          gameDebugWarn("playview", `Command failed: ${commandType}: ${error}`);
          host.onGameError(error);
          logEvent("game_command_failed", `${commandType} failed: ${error}`);
        }
      }
    },

    logEvent,
    requestSaveState,
    isSaveStatePending: () => saveStateResolver !== null,

    async loadAutosave(session) {
      const { kidId, gameId } = game();
      try {
        const detail = await fetchAutosaveSnapshot(deps.snapshots, kidId, gameId);
        if (!detail) return undefined;
        const { payload } = decodeSnapshotPayload(detail, session, null);
        lastAutosaved = JSON.stringify(payload.savedState);
        return payload.savedState;
      } catch (error) {
        // Unreadable slot → play fresh; the next autosave overwrites it.
        gameDebugWarn("playview", "autosave restore failed:", error);
        return undefined;
      }
    },

    scheduleAutosave,

    restartFresh() {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
      lastAutosaved = null;
      scheduleAutosave();
    },

    captureSnapshotContent,

    async saveSnapshot(opts) {
      const session = deps.vault.getState().session;
      if (!session) throw new Error("vault_locked");
      const title = snapshotTitle(opts?.requestedTitle);
      const content = await captureSnapshotContent(title);
      if (!content) throw new Error("no_save_state");
      opts?.onCaptured?.(content);

      const { kidId } = game();
      await createOwnSnapshot(deps.snapshots, {
        kidId,
        gameId: content.payload.gameId,
        ...sealOwnSnapshot(session, content),
      });
      deps.logActivity({ kidId, event: "snapshot_created", message: `Snapshot saved: ${title}` });
      return { title };
    },

    async shareSnapshot(opts) {
      const session = deps.vault.getState().session;
      if (!session) throw new Error("vault_locked");
      const { kidId } = game();
      const kid = await deps.kids.getState().loadOne(kidId);
      if (!kid) throw new Error("kid_not_found");

      const resolution = await resolveFriendForShare(deps.snapshots, kid, session, opts.friendName);
      if (resolution.kind !== "ok") return resolution;

      const title = snapshotTitle(opts.requestedTitle);
      const content = await captureSnapshotContent(title);
      if (!content) throw new Error("no_save_state");
      opts.onCaptured?.(content);

      // Share implies save: the kid keeps their own copy, marked with the
      // recipient so the parent view can list it under "Sent"…
      const own = sealOwnSnapshot(session, content);
      await createOwnSnapshot(deps.snapshots, {
        kidId,
        gameId: content.payload.gameId,
        ...own,
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
      await shareSnapshotWithFriend(deps.snapshots, {
        senderKidId: kidId,
        friendshipId: resolution.friendshipId,
        gameId: content.payload.gameId,
        infoEnc: infoEnvelope,
        payloadEnc: payloadEnvelope,
        payloadBytes: own.payloadBytes,
      });
      deps.logActivity({
        kidId,
        event: "snapshot_shared",
        message: `Snapshot shared with ${resolution.displayName}: ${title}`,
      });
      return { kind: "ok", title, displayName: resolution.displayName };
    },

    dispose() {
      if (autosaveTimer) {
        clearTimeout(autosaveTimer);
        autosaveTimer = null;
      }
    },
  };
}
