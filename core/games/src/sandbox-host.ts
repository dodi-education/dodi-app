/**
 * The host side of the game bridge, independent of how messages travel: the
 * web posts into an iframe's contentWindow, the mobile app injects into a
 * WebView. It owns the bridge token, the `dodi:init` handshake (with retries
 * until `game:ready`), the command queue before ready, snapshot requests and
 * the validation of everything the game sends back (schema + token).
 */
import { gameDebug, gameDebugWarn } from "./debug";
import {
  createBridgeToken,
  GameToParentMessageSchema,
  isBridgeTokenValid,
  toJsonSafeMessage,
} from "./bridge-protocol";
import type { MetricsSummary } from "./success";
import type {
  GameCommand,
  GameGoal,
  GameSaveState,
  GameToParentMessage,
  ParentToGameMessage,
} from "@dodi/types/games";

export interface GameProgressUpdate {
  progress: number;
  progressLabel?: string;
  metrics?: MetricsSummary;
}

/** What a client can ask of a running game (the web's GameSandbox ref). */
export interface GameSandboxHandle {
  sendCommand: (command: GameCommand) => void;
  requestState: () => void;
  /** Ask the game for its full restorable serialization (game:save_state reply). */
  requestSaveState: () => void;
  /** Tell the game the success goal was met so it can celebrate. */
  notifySuccess: (payload?: { summary?: string; metrics?: MetricsSummary }) => void;
  /**
   * Capture the current game surface as a data URL. With `preferGameCapture`
   * the game's own `get_snapshot` implementation is asked first (best fidelity
   * for canvas games); the host-injected shim capture is the universal
   * fallback. Resolves null when both fail (never rejects).
   */
  requestSnapshot: (opts?: { preferGameCapture?: boolean }) => Promise<string | null>;
}

export interface SandboxHostEvents {
  onMessage?: (message: GameToParentMessage) => void;
  onStateChange?: (state: Record<string, unknown>) => void;
  /** State from command results (game:result), delivered immediately. */
  onCommandResult?: (state: Record<string, unknown>) => void;
  /** Immediate game:progress updates (progress + standardized metrics). */
  onProgress?: (update: GameProgressUpdate) => void;
}

/** The game's init payload, read at send time so changes never re-init a running game. */
export interface SandboxInitInput {
  goal?: GameGoal;
  savedState?: GameSaveState;
  locale?: string;
}

export interface SandboxHostOptions {
  gameId: string;
  /** Deliver one message into the sandbox; false when it isn't reachable yet. */
  post: (message: ParentToGameMessage) => boolean;
  init: () => SandboxInitInput;
  /** Read on every message, so callers can swap handlers without a new host. */
  events: () => SandboxHostEvents;
}

export interface SandboxHost extends GameSandboxHandle {
  /** The sandbox document (re)loaded: start the handshake. */
  sendInit(): void;
  /** Handshake still pending (e.g. a remount lost the reply). */
  isReady(): boolean;
  /** Anything the sandbox sent; validated here, junk is dropped. */
  receive(data: unknown): void;
  dispose(): void;
}

const INIT_RETRY_INTERVAL_MS = 300;
const INIT_MAX_RETRIES = 10;
/** How long each snapshot capture attempt (game-implemented or shim) may take. */
const SNAPSHOT_TIMEOUT_MS = 2500;

export function createSandboxHost({ gameId, post, init, events }: SandboxHostOptions): SandboxHost {
  const token = createBridgeToken();
  let isGameReady = false;
  let initRetry: ReturnType<typeof setInterval> | null = null;
  let pendingCommands: GameCommand[] = [];
  // Pending requestSnapshot resolver, fed by game:event snapshot/host_snapshot.
  let snapshotResolver: ((snapshot: string | null) => void) | null = null;

  const postEnvelope = (message: ParentToGameMessage): void => {
    gameDebug(
      "sandbox",
      `Posting to sandbox: ${message.type}`,
      message.type === "dodi:command" ? message : { type: message.type },
    );
    if (!post(message)) gameDebugWarn("sandbox", `Cannot post ${message.type}: sandbox not available`);
  };

  const postCommand = (command: GameCommand): void =>
    postEnvelope({ type: "dodi:command", token, payload: { command } });

  const clearInitRetry = (): void => {
    if (initRetry) {
      clearInterval(initRetry);
      initRetry = null;
    }
  };

  const sendInit = (): void => {
    isGameReady = false;
    pendingCommands = [];
    clearInitRetry();
    const { goal, savedState, locale } = init();
    const message: ParentToGameMessage = {
      type: "dodi:init",
      token,
      payload: { gameId, goal, savedState, locale },
    };
    gameDebug("sandbox", `Sending dodi:init to game ${gameId} (with retry)`);
    postEnvelope(message);

    let retryCount = 0;
    initRetry = setInterval(() => {
      retryCount++;
      if (isGameReady || retryCount >= INIT_MAX_RETRIES) {
        clearInitRetry();
        if (!isGameReady) {
          gameDebugWarn("sandbox", `dodi:init: gave up after ${retryCount} retries, no game:ready received`);
        }
        return;
      }
      gameDebug("sandbox", `Retrying dodi:init (attempt ${retryCount + 1})`);
      postEnvelope(message);
    }, INIT_RETRY_INTERVAL_MS);
  };

  // One capture attempt: ask the game (get_snapshot command) or the shim
  // (dodi:host_snapshot), then wait for the matching game:event reply.
  const requestSnapshotOnce = (kind: "game" | "host"): Promise<string | null> =>
    new Promise((resolve) => {
      let isSettled = false;
      const finish = (snapshot: string | null): void => {
        if (isSettled) return;
        isSettled = true;
        if (snapshotResolver === finish) snapshotResolver = null;
        resolve(snapshot);
      };
      // A newer request supersedes any stalled one.
      snapshotResolver?.(null);
      snapshotResolver = finish;
      if (kind === "game") postCommand({ type: "get_snapshot" });
      else postEnvelope({ type: "dodi:host_snapshot", token });
      setTimeout(() => finish(null), SNAPSHOT_TIMEOUT_MS);
    });

  const receive = (data: unknown): void => {
    // Tolerate non-JSON payload values from game code (undefined properties
    // etc.): normalize to plain JSON before validating.
    const parsed = GameToParentMessageSchema.safeParse(toJsonSafeMessage(data));
    if (!parsed.success) {
      gameDebugWarn("sandbox", "Schema validation FAILED for message:", data, "Issues:", parsed.error.issues);
      return;
    }
    const message = parsed.data;
    if (!isBridgeTokenValid(message.token, token)) {
      gameDebugWarn("sandbox", `Invalid bridge token on message: ${message.type}`);
      return;
    }
    gameDebug("sandbox", `Received from sandbox: ${message.type}`, message);
    const { onMessage, onStateChange, onCommandResult, onProgress } = events();

    if (message.type === "game:ready") {
      isGameReady = true;
      clearInitRetry();
      if (message.payload.state) onStateChange?.(message.payload.state as Record<string, unknown>);
      // Flush any commands that arrived before the game was ready.
      const pending = pendingCommands;
      pendingCommands = [];
      if (pending.length > 0) gameDebug("sandbox", `Flushing ${pending.length} queued commands`);
      for (const command of pending) postCommand(command);
    }

    if (message.type === "game:state") onStateChange?.(message.payload as Record<string, unknown>);

    if (message.type === "game:progress") {
      onProgress?.({
        progress: message.payload.progress,
        progressLabel: message.payload.progressLabel,
        metrics: message.payload.metrics,
      });
    }

    if (
      message.type === "game:event" &&
      (message.payload.event === "snapshot" || message.payload.event === "host_snapshot")
    ) {
      const snapshot = (message.payload as Record<string, unknown>).snapshot;
      snapshotResolver?.(typeof snapshot === "string" && snapshot ? snapshot : null);
    }

    if (message.type === "game:result" && message.payload.state) {
      gameDebug("sandbox", `Command result (ok=${message.payload.result.ok}):`, message.payload);
      const resultState = message.payload.state as Record<string, unknown>;
      if (onCommandResult) onCommandResult(resultState);
      else onStateChange?.(resultState);
    }

    onMessage?.(message as GameToParentMessage);
  };

  return {
    sendInit,
    isReady: () => isGameReady,
    receive,
    dispose: clearInitRetry,
    sendCommand(command) {
      if (!isGameReady) {
        gameDebug("sandbox", `Game not ready, queuing command: ${command.type}`);
        pendingCommands.push(command);
        return;
      }
      postCommand(command);
    },
    requestState: () => postEnvelope({ type: "dodi:get_state", token }),
    requestSaveState: () => postEnvelope({ type: "dodi:get_save_state", token }),
    notifySuccess: (payload) => postEnvelope({ type: "dodi:success", token, payload: payload ?? {} }),
    async requestSnapshot(opts) {
      if (opts?.preferGameCapture) {
        const viaGame = await requestSnapshotOnce("game");
        if (viaGame) return viaGame;
      }
      return requestSnapshotOnce("host");
    },
  };
}
