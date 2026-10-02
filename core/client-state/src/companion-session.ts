/**
 * The voice companion session: one realtime voice conversation between the
 * kid and their companion, at home or inside a game. Shared by web and
 * mobile; each client supplies the platform through ports (audio, socket,
 * device storage, page/app lifecycle) and binds the vanilla store to React.
 *
 * Everything runs on the device (BYOK provider blindness): the voice config is
 * assembled from vault-decrypted data, the provider key lives in memory only,
 * and the platform sees exactly the requests it always did (transcripts as
 * ciphertext, presence toggles, activity + usage telemetry).
 *
 * State machine (`state`): disconnected → connecting → active ⇄ deaf → sleep.
 * Output mute (`muted`) is orthogonal. Two socket strategies: "persistent"
 * (Gemini: one socket per session) and "pooled" (xAI: warm never-audio
 * standbys, the tainted active socket is closed on deafen). See
 * `@dodi/ai/voice/voice-socket-pool`.
 */
import { createStore, type StoreApi } from "zustand/vanilla";

import { getLanguageDisplayName } from "@dodi/ai/dodi-context";
import { analyzeGameState } from "@dodi/ai/game-analysis";
import { createVoiceClient, type VoiceClientFactory } from "@dodi/ai/voice/create-voice-client";
import {
  buildGameVoiceConfig,
  buildHomeVoiceConfig,
  type GameSessionContextInput,
  type VoiceSessionConfig,
} from "@dodi/ai/voice/session-config";
import {
  voiceSocketStrategy,
  type VoiceClient,
  type VoiceEvent,
  type VoiceSocketStrategy,
} from "@dodi/ai/voice/voice-client";
import { defaultVoiceTransport, type VoiceTransport } from "@dodi/ai/voice/voice-socket";
import { VoiceSocketPool, VoiceSocketPoolError } from "@dodi/ai/voice/voice-socket-pool";
import { extractCommandMarkers } from "@dodi/games/command-markers";
import { gameDebug, gameDebugWarn } from "@dodi/games/debug";
import { STANDARD_TOOLS_BY_NAME } from "@dodi/games/toolbox";
import type { AIProviderId } from "@dodi/types/ai";
import type { GameCommand } from "@dodi/types/games";

import { type AudioPort, type AudioSpeaker, isMicrophoneError, type MicRecorder } from "./companion-audio";
import { createCompanionPresence } from "./companion-presence";
import { createConversationRecap } from "./companion-recap";
import { createCompanionSources } from "./companion-sources";
import { readKidVolume } from "./companion-volume-store";
import type { ClientState } from "./client-state";
import { createGameTextAssistant, type GameTextAssistant } from "./game-text-assistant";
import { logKidActivity } from "./kid-activity";
import { isUuidLike, resolveLaunchGameTarget } from "./launch-game";
import { createMemoryUpdater, type MemoryUpdater } from "./memory-update";
import type { DeviceStorage, PlatformApi } from "./platform";
import { createTelemetry, type Telemetry } from "./telemetry";
import { createTranscriptSync, type TranscriptSync } from "./transcript-sync";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CompanionDisplayMode = "full" | "compact";

export type CompanionContext =
  | { type: "home" }
  | { type: "browse" }
  | {
      type: "game";
      gameId: string;
      /**
       * Present when playing a SNAPSHOT: identifies the session (reconnect key)
       * and marks that no play records / game-scoped usage rows may reference
       * `gameId` (the row may be another family's or deleted).
       */
      snapshotId?: string;
      /** Game info for snapshot play, where fetching /api/games/{gameId} may 404. */
      inline?: { title: string; description: string };
      markdown: string;
      codeBundle: string;
      gameState: Record<string, unknown>;
      /** Standardized commands the game implements (drives snapshot gating etc.). */
      capabilities: string[];
    };

export type CompanionStatus = "disconnected" | "connecting" | "active" | "deaf" | "sleep";

// In-game AI provider work the companion should visibly "think" through.
// "image" = image provider (drawing); "writing" = thinking provider filling
// game content slots (generate_text); "thinking" = thinking provider
// (game-state analysis, and future in-game text assistant).
export type CompanionActivity = "image" | "thinking" | "writing";

export interface CompanionMessage {
  id: string;
  role: "kid" | "dodi";
  text: string;
}

export interface CompanionSessionState {
  // Display
  displayMode: CompanionDisplayMode;
  context: CompanionContext;

  // Core state
  kidId: string | null;
  state: CompanionStatus;
  // Output mute — orthogonal to `state`. Composes with every state value
  // (muted+active, muted+deaf, …): while true the companion produces NO audio
  // and game read-alouds are refused, but its listening state is untouched.
  // Persisted on kids.muted_dodi_at, independent of the deaf toggle
  // (kids.deafened_dodi_at).
  muted: boolean;
  dodiSpeaking: boolean;
  gestureNeeded: boolean;
  error: string | null;
  // Set when a close is unrecoverable (quota, auth). Suppresses auto-reconnect.
  fatalError: boolean;

  // Text chat (for game text mode)
  chatMessages: CompanionMessage[];
  chatSubmitting: boolean;

  // Game command callback
  onRunCommands: ((commands: GameCommand[]) => void) | null;
  // Game snapshot callback (for analyze_game_state vision analysis)
  onRequestSnapshot: (() => Promise<string | null>) | null;

  // Ref-counted active in-game AI provider work by category. Drives the
  // companion's "thinking" avatar + status line. Ref-counted so overlapping
  // calls don't clear the state early.
  aiActivity: Record<CompanionActivity, number>;
  beginAiActivity: (kind: CompanionActivity) => void;
  endAiActivity: (kind: CompanionActivity) => void;
  // Release a held-open client tool call (generate_drawing, generate_text,
  // save_snapshot, share_snapshot) once the app-side work finished (or failed).
  // The companion stays silent while the call is pending, then speaks one
  // completion line driven by `message`/`error`.
  resolveClientCommand: (result: { ok: boolean; message?: string; error?: string }) => void;

  // Have the companion read a short game-provided text aloud through the voice
  // session (game:event "request_generate_voice", intercepted by the play view).
  // Synchronous: ok=true means the read-aloud turn was submitted (or is being
  // submitted on a borrowed socket); ok=false with the stable "voice_unavailable"
  // code means it can't speak right now. Deaf still speaks (ears off, voice on);
  // only a full mute, sleep, or a dead session refuses — mute means mute.
  speakGameVoiceText: (text: string) => { ok: true } | { ok: false; error: "voice_unavailable" };

  // Count of kid turns ("asking the companion") while a game is open — feeds
  // the hintsUsed metric for success evaluation. Reset per play by the play view.
  gameAssistanceCount: number;
  resetGameAssistance: () => void;

  // Navigation (set by launch_game tool, consumed by layout)
  pendingNavigation: string | null;
  clearPendingNavigation: () => void;

  // Actions
  setContext: (context: CompanionContext, kidId: string) => Promise<void>;
  setDisplayMode: (mode: CompanionDisplayMode) => void;
  connect: (kidId: string) => Promise<void>;
  /** Wake from deaf. `deliberate` false = an incidental page click, which never
   *  clears a persisted deaf toggle (see the any-click handler in KidChrome). */
  activate: (options?: { deliberate?: boolean }) => Promise<void>;
  deactivate: () => void;
  toggleActive: () => void;
  /** Toggle output mute (kids.muted_dodi_at). Output-only: never changes the
   *  deaf/active listening state. `kidId` persists the toggle when no session is
   *  connected yet (the header control passes the active kid). */
  setMuted: (muted: boolean, kidId?: string) => void;
  endSession: () => void;
  // Force-process everything accumulated so far into memory, now (manual
  // ?process-memory trigger), without waiting for a day change.
  processMemoryNow: (kidId: string) => void;
  sendTextMessage: (message: string, gameId?: string) => Promise<void>;
  updateGameState: (state: Record<string, unknown>) => void;
  setOnRunCommands: (handler: ((commands: GameCommand[]) => void) | null) => void;
  setOnRequestSnapshot: (handler: (() => Promise<string | null>) | null) => void;
}

// Is any in-game AI provider currently working? Drives the "thinking" avatar.
export const selectCompanionThinking = (s: CompanionSessionState): boolean =>
  s.aiActivity.image > 0 || s.aiActivity.thinking > 0 || s.aiActivity.writing > 0;

// Which activity's copy to show; image wins over writing over thinking.
export const selectCompanionActivityKind = (s: CompanionSessionState): CompanionActivity | null =>
  s.aiActivity.image > 0
    ? "image"
    : s.aiActivity.writing > 0
      ? "writing"
      : s.aiActivity.thinking > 0
        ? "thinking"
        : null;

/**
 * Stable identity of a context for "did the page's context change?" checks:
 * the type, plus the game (or snapshot) for game contexts. Two snapshots of
 * the same game are distinct sessions (different restored state).
 */
export function companionContextKey(context: CompanionContext): string {
  return context.type === "game" ? `game:${context.snapshotId ?? context.gameId}` : context.type;
}

/** Whether switching from `a` to `b` needs a new voice session. */
export function contextRequiresReconnect(a: CompanionContext, b: CompanionContext): boolean {
  // home <-> browse: no reconnect needed
  if ((a.type === "home" && b.type === "browse") || (a.type === "browse" && b.type === "home")) {
    return false;
  }
  // same game (or same snapshot session): no reconnect
  if (
    a.type === "game" &&
    b.type === "game" &&
    (a.snapshotId ?? a.gameId) === (b.snapshotId ?? b.gameId)
  ) {
    return false;
  }
  // same type and both non-game
  if (a.type === b.type && a.type !== "game") {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/** "The app is going away now" (web: beforeunload + pagehide; mobile: background). */
export interface CompanionLifecycle {
  /** Subscribe; returns the unsubscribe. The handler must stay synchronous. */
  onExit(handler: () => void): () => void;
}

/** Any user interaction (tap, click, key) that should keep the companion awake. */
export interface CompanionInteraction {
  /** Subscribe; returns the unsubscribe. */
  onInteraction(handler: () => void): () => void;
}

/** The session's collaborators. Defaults are built from the deps; tests swap them. */
export interface CompanionServices {
  transcripts: TranscriptSync;
  updateMemory: MemoryUpdater;
  buildHomeVoiceConfig(kidId: string): Promise<VoiceSessionConfig>;
  buildGameVoiceConfig(kidId: string, ctx: GameSessionContextInput): Promise<VoiceSessionConfig>;
  runGameTextAssistant: GameTextAssistant;
  createVoiceClient: VoiceClientFactory;
  analyzeGameState: typeof analyzeGameState;
}

export type CompanionStores = Pick<
  ClientState,
  "kids" | "games" | "vault" | "connectivity" | "companionVolume" | "execution"
>;

export interface CompanionSessionDeps {
  /** The platform API (transcripts, presence toggles, activity, usage). */
  api: PlatformApi;
  /** The app's shared stores (`createClientState` result satisfies this). */
  state: CompanionStores;
  /** Microphone + speaker. */
  audio: AudioPort;
  /**
   * Synchronous device storage for the transcript and presence outboxes, the
   * greeting markers and the per-kid volume. Use the same backing store as
   * `ClientPlatform.preferences` so the volume level matches the volume store.
   */
  storage: DeviceStorage;
  /** A fresh UUID (transcript entry ids). */
  randomUUID(): string;
  /** Socket + fetch for the voice providers; defaults to the global WebSocket/fetch. */
  transport?: VoiceTransport;
  lifecycle?: CompanionLifecycle;
  interaction?: CompanionInteraction;
  /** Usage reporting; defaults to `createTelemetry(api)`. */
  telemetry?: Pick<Telemetry, "reportUsage">;
  /** Test seams. */
  services?: Partial<CompanionServices>;
}

export interface CompanionSession {
  store: StoreApi<CompanionSessionState>;
  /** Loudness of the companion's voice playing right now, 0..1 (drives the 3D jaw). */
  outputLevel(): number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 40;
// How long to hold each client tool call open before giving up (so dropped/
// hung app-side work can't freeze the voice turn). Image generation is the slow
// one — the Live API tolerates silent holds ≥12s (verified); snapshot save/share
// are one state capture + one or two POSTs.
const CLIENT_CALL_TIMEOUT_MS: Record<string, number> = {
  generate_drawing: 30000,
  // Multi-slot text generation on a thinking model can outlast image generation.
  generate_text: 45000,
  save_snapshot: 15000,
  share_snapshot: 20000,
};
const CLIENT_CALL_TIMEOUT_FALLBACK_MS = 15000;
// How long to hold a bridge tool response open waiting for the game's state
// event. Bridge commands run synchronously in the sandbox, so the state event
// normally lands well under a second.
const BRIDGE_CALL_TIMEOUT_MS = 2000;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
// Minimum gap between fast recoveries (pooled strategy): an active socket that
// keeps dying is a systematic failure — stop promoting standbys into it.
const FAST_RECOVERY_MIN_INTERVAL_MS = 30 * 1000;
const GAME_SPEECH_MAX_MS = 45_000;

// Framing for a game read-aloud: the text is untrusted game output, so it is
// quoted material to read, never instructions. The play view caps its length.
const READ_ALOUD_FRAME =
  "The game asks you to read a text out loud to the child right now. " +
  "Read it exactly as written, in the text's own language, warmly and " +
  "clearly, with no introduction, no commentary, nothing added before or " +
  "after:\n\n";

function isAbortError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name: unknown }).name === "AbortError"
  );
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createCompanionSession(deps: CompanionSessionDeps): CompanionSession {
  const { api, state: stores, audio, storage } = deps;
  const telemetry = deps.telemetry ?? createTelemetry(api);
  const reportUsage: Telemetry["reportUsage"] = (report, opts) =>
    telemetry.reportUsage(report, opts);
  const transport = deps.transport ?? defaultVoiceTransport();

  const sources = createCompanionSources({
    api,
    kids: stores.kids,
    games: stores.games,
    vault: stores.vault,
    execution: stores.execution,
  });
  const services: CompanionServices = {
    transcripts:
      deps.services?.transcripts ??
      createTranscriptSync({
        api,
        getSession: () => stores.vault.getState().session,
        getPersonaId: (kidId) =>
          stores.kids.getState().list?.find((k) => k.id === kidId)?.active_persona?.id ?? null,
        storage,
        randomUUID: deps.randomUUID,
      }),
    updateMemory:
      deps.services?.updateMemory ??
      createMemoryUpdater({
        api,
        sources,
        resolveExecution: (input) => stores.execution.resolveExecution(input),
        invalidateKids: () => stores.kids.getState().invalidate(),
        reportUsage,
      }),
    buildHomeVoiceConfig:
      deps.services?.buildHomeVoiceConfig ?? ((kidId) => buildHomeVoiceConfig(sources, kidId)),
    buildGameVoiceConfig:
      deps.services?.buildGameVoiceConfig ??
      ((kidId, ctx) => buildGameVoiceConfig(sources, kidId, ctx)),
    runGameTextAssistant:
      deps.services?.runGameTextAssistant ??
      createGameTextAssistant({
        sources,
        resolveThinking: () => stores.execution.resolveThinking(),
        reportUsage,
      }),
    createVoiceClient:
      deps.services?.createVoiceClient ??
      ((config, onEvent) => createVoiceClient(config, onEvent, transport)),
    analyzeGameState: deps.services?.analyzeGameState ?? analyzeGameState,
  };
  const { transcripts } = services;
  const presence = createCompanionPresence({ api, kids: stores.kids, storage });
  const recap = createConversationRecap();
  const isOnline = (): boolean => stores.connectivity.getState().isOnline;

  // The store is created below; every helper reads/writes through these.
  // eslint-disable-next-line prefer-const
  let store: StoreApi<CompanionSessionState>;
  const set = (partial: Partial<CompanionSessionState>): void => store.setState(partial);
  const get = (): CompanionSessionState => store.getState();

  // -------------------------------------------------------------------------
  // Session refs (outside the store: not state anyone renders)
  // -------------------------------------------------------------------------

  let client: VoiceClient | null = null;
  let streamer: AudioSpeaker | null = null;
  // Whether the model has finished generating its current turn (no audio chunk
  // since the last turnComplete). It streams faster than realtime, so the voice
  // usually keeps playing well past turnComplete: speaking stops only once the
  // turn is complete AND the speaker has played out its queue.
  let modelTurnComplete = true;
  let recorder: MicRecorder | null = null;
  let abortController: AbortController | null = null;

  // Pooled-strategy refs (xAI): warm never-audio standby sockets. While deaf
  // there is NO active client at all — deafening retires (closes) the tainted
  // socket, activation acquires a warm one.
  let pool: VoiceSocketPool | null = null;
  let sessionStrategy: VoiceSocketStrategy = "persistent";
  // Rate limit for promoting a warm socket after an unexpected active-socket
  // drop — repeated drops fall through to the full teardown path instead.
  let lastFastRecoveryAt = 0;
  // Whether the current `client`'s session has witnessed this conversation. A
  // freshly attached socket gets a recap context frame on its first activation.
  let socketHasHistory = false;

  let currentKidId: string | null = null;
  // Round coalescer: streaming transcription fragments accumulate here until the
  // speaker changes or the turn completes, then flush as ONE entry.
  let roundRole: "kid" | "dodi" | null = null;
  let roundText = "";
  let roundStartedAt: string | null = null;
  let sessionStartedAt: string | null = null;
  // Memory updates are serialized through this chain. Auto (connect-time) runs
  // coalesce while one is queued or running; a manual ?process-memory run always
  // appends — queued behind an in-flight run, never dropped.
  let memoryUpdateChain: Promise<void> = Promise.resolve();
  let autoMemoryRunQueued = false;
  let greetingSent = false;
  let hasGreetedThisRun = false;
  let sessionIsBirthday = false;
  let micRequestInFlight = false;
  let tapStartedAtMs: number | null = null;

  // Game voice state refs
  let turnBuffer = "";
  let gameAssistanceTurns = 0;

  // A game-requested read-aloud (speakGameVoiceText) is in flight. While deaf
  // this is the ONLY thing allowed to produce audio, and it also bypasses the
  // greetingSent gate (a session that came up deaf never greeted). On the pooled
  // strategy the socket it borrows is retired when the turn completes.
  let gameSpeechActive = false;
  let gameSpeechTimeout: ReturnType<typeof setTimeout> | null = null;

  // The provider/model of the current voice session, set whenever a config is
  // built (connect / setContext). Drives usage attribution.
  let sessionProvider: AIProviderId | null = null;
  let sessionModel: string | null = null;

  // Voice active-minute metering. Live voice APIs expose no reliable token
  // usage, so we meter wall-clock time in the "active" state. The
  // kid/game/provider is captured at START so attribution survives even when
  // `currentKidId` is nulled before cleanup() (sleep / endSession do that). One
  // `voice_minutes` event per active↔inactive cycle; stop is idempotent.
  let voiceActiveSince: number | null = null;
  let voiceMeterKidId: string | null = null;
  let voiceMeterGameId: string | null = null;
  let voiceMeterProvider: AIProviderId | null = null;
  let voiceMeterModel: string | null = null;

  // Deferred client tool call (generate_drawing, save_snapshot, share_snapshot):
  // hold the tool response until the app-side work lands so the voice model
  // stays silent (a pending function call yields no audio) instead of looping
  // filler. Resolved by resolveClientCommand() from the play view; timed out as
  // a safety net. At most one call is pending at a time.
  let pendingClientCall: { id: string; name: string } | null = null;
  let clientCallTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  // Deferred BRIDGE tool calls (submit_answer, next_task, …): the response is
  // held until the first game-state event after the command lands, so the model
  // observes the command's outcome in the tool response itself — game state is
  // never pushed unprompted. FIFO; a per-entry timeout answers a plain ok.
  let pendingBridgeCalls: Array<{
    id: string;
    name: string;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  // Turn tracking (debugging)
  let turnNumber = 0;
  let turnAudioChunks = 0;

  // Context switch generation counter (prevents stale async from applying)
  let contextGeneration = 0;

  let inactivityTimer: ReturnType<typeof setTimeout> | null = null;
  let stopInteraction: (() => void) | null = null;
  let stopExit: (() => void) | null = null;

  // -------------------------------------------------------------------------
  // AI activity
  // -------------------------------------------------------------------------

  // Wrap any in-game AI provider call so the companion shows its "thinking"
  // state for the call's whole lifetime, cleared even on throw.
  async function withAiActivity<T>(kind: CompanionActivity, fn: () => Promise<T>): Promise<T> {
    get().beginAiActivity(kind);
    try {
      return await fn();
    } finally {
      get().endAiActivity(kind);
    }
  }

  // -------------------------------------------------------------------------
  // Voice metering
  // -------------------------------------------------------------------------

  function voiceMeterStart(): void {
    if (voiceActiveSince !== null || !currentKidId) return;
    voiceActiveSince = Date.now();
    voiceMeterKidId = currentKidId;
    voiceMeterProvider = sessionProvider;
    voiceMeterModel = sessionModel;
    const ctx = get().context;
    // Snapshot play: gameId may reference a deleted or foreign game — usage rows
    // FK games, so attribute snapshot sessions to no game.
    voiceMeterGameId = ctx.type === "game" && !ctx.snapshotId ? ctx.gameId : null;
  }

  function voiceMeterStop(keepalive = false): void {
    if (voiceActiveSince === null) return;
    const seconds = Math.round((Date.now() - voiceActiveSince) / 1000);
    const kidId = voiceMeterKidId;
    const gameId = voiceMeterGameId;
    const provider = voiceMeterProvider;
    const model = voiceMeterModel;
    voiceActiveSince = null;
    voiceMeterKidId = null;
    voiceMeterGameId = null;
    voiceMeterProvider = null;
    voiceMeterModel = null;
    if (seconds < 1 || !kidId || !provider || !model) return;
    reportUsage(
      {
        eventType: "voice_minutes",
        kidId,
        gameId,
        provider,
        model,
        voiceSeconds: seconds,
      },
      { keepalive },
    );
  }

  // -------------------------------------------------------------------------
  // Inactivity timer + interaction / exit listeners
  // -------------------------------------------------------------------------

  function clearInactivityTimer(): void {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
      inactivityTimer = null;
    }
  }

  function resetInactivityTimer(): void {
    clearInactivityTimer();
    inactivityTimer = setTimeout(sleepFromInactivity, INACTIVITY_TIMEOUT_MS);
  }

  function startInteractionListeners(): void {
    if (stopInteraction || !deps.interaction) return;
    stopInteraction = deps.interaction.onInteraction(resetInactivityTimer);
  }

  function stopInteractionListeners(): void {
    stopInteraction?.();
    stopInteraction = null;
  }

  // On exit we flush the in-progress round into the outbox (synchronous storage
  // write = crash persistence); the next connect POSTs it. Under E2EE only
  // ciphertext ever reaches the server.
  function handleExit(): void {
    voiceMeterStop(true);
    flushRound();
  }

  function startExitListener(): void {
    if (stopExit || !deps.lifecycle) return;
    stopExit = deps.lifecycle.onExit(handleExit);
  }

  function stopExitListener(): void {
    stopExit?.();
    stopExit = null;
  }

  function sleepFromInactivity(): void {
    const st = get();
    if (st.state !== "active" && st.state !== "deaf") return;

    // Flush the in-progress round and push the outbox to the DB; memory
    // processing happens on the next connect.
    flushRound();
    if (currentKidId) void transcripts.flushNow(currentKidId);

    stopExitListener();
    stopInteractionListeners();

    currentKidId = null;
    sessionStartedAt = null;

    cleanup();
    resetFlowFlags();

    set({
      state: "sleep",
      dodiSpeaking: false,
      gestureNeeded: false,
      error: null,
      chatMessages: [],
      chatSubmitting: false,
    });
  }

  // -------------------------------------------------------------------------
  // Transcript rounds
  // -------------------------------------------------------------------------

  /** Finalize the buffered speaker-run into one recorded transcript round. */
  function flushRound(): void {
    const text = roundText.trim();
    if (roundRole && text) {
      transcripts.recordRound({
        role: roundRole,
        text,
        occurredAt: roundStartedAt ?? new Date().toISOString(),
      });
      // Feed the recap replayed onto fresh sockets (pooled swaps, sleep→wake).
      recap.record(roundRole, text);
    }
    roundRole = null;
    roundText = "";
    roundStartedAt = null;
  }

  /** Append a streaming transcription fragment, coalescing same-speaker runs. */
  function appendRoundFragment(role: "kid" | "dodi", fragment: string): void {
    if (roundRole !== role) {
      flushRound();
      roundRole = role;
      roundStartedAt = new Date().toISOString();
    }
    roundText += fragment;
  }

  /**
   * Flush the outbox, then process unprocessed day transcripts into memory.
   * `includeToday` is the manual ?process-memory path.
   */
  function flushAndProcessMemory(kidId: string, opts: { includeToday?: boolean } = {}): void {
    void (async () => {
      if (opts.includeToday) {
        await transcripts.flushNow(kidId);
      } else {
        await transcripts.syncAndSeed(kidId);
        // Coalesce overlapping auto runs (e.g. rapid reconnects) — one pass over
        // the open days is enough.
        if (autoMemoryRunQueued) return;
        autoMemoryRunQueued = true;
      }
      memoryUpdateChain = memoryUpdateChain.then(async () => {
        try {
          await services.updateMemory(kidId, opts);
        } finally {
          if (!opts.includeToday) autoMemoryRunQueued = false;
        }
      });
    })();
  }

  // -------------------------------------------------------------------------
  // Resource cleanup
  // -------------------------------------------------------------------------

  function clearClientCallTimeout(): void {
    if (clientCallTimeoutTimer) {
      clearTimeout(clientCallTimeoutTimer);
      clientCallTimeoutTimer = null;
    }
  }

  function clearPendingBridgeCalls(): void {
    for (const call of pendingBridgeCalls) clearTimeout(call.timer);
    pendingBridgeCalls = [];
  }

  /** New speaker pre-set to the current kid's persisted output volume, so the
   *  first utterance already plays at the chosen loudness (no jump). */
  function createStreamer(): AudioSpeaker {
    const s = audio.createSpeaker();
    s.setVolume(
      currentKidId ? readKidVolume(storage, currentKidId) : stores.companionVolume.getState().volume,
    );
    // The queue ran dry. Mid-turn that is only a gap in the stream (more voice
    // is coming); a retired speaker must not touch the current one's speech.
    // Only clears the flag, never transitions state.
    s.onPlaybackEnd(() => {
      if (streamer !== s || !modelTurnComplete) return;
      set({ dodiSpeaking: false });
    });
    return s;
  }

  /** The model's turn is over: stop speaking now if nothing is left to play,
   *  otherwise when the speaker reports the queue played out. */
  function endSpeakingAfterPlayback(): void {
    modelTurnComplete = true;
    if ((streamer?.backlogSeconds() ?? 0) > 0) return;
    set({ dodiSpeaking: false });
  }

  function cleanup(): void {
    // Catch-all for sleep / endSession / reconnect / error paths (idempotent).
    voiceMeterStop();
    abortController?.abort();
    abortController = null;

    recorder?.stop();
    recorder = null;

    streamer?.stop();
    streamer?.destroy();
    streamer = null;

    client?.disconnect();
    client = null;

    pool?.destroy();
    pool = null;

    clearPendingBridgeCalls();
    clearClientCallTimeout();
    pendingClientCall = null;
    clearInactivityTimer();
    clearGameSpeechTimeout();
    gameSpeechActive = false;
    stopInteractionListeners();
    turnNumber = 0;
    turnAudioChunks = 0;
    turnBuffer = "";
    gameAssistanceTurns = 0;
  }

  function resetFlowFlags(): void {
    greetingSent = false;
    sessionIsBirthday = false;
    micRequestInFlight = false;
    tapStartedAtMs = null;
  }

  function getGreetingMode(kidId: string, isBirthday: boolean): "long" | "short" | "birthday" {
    if (isBirthday) {
      const birthdayKey = `dodi-birthday-greeting-${kidId}`;
      const today = new Date().toISOString().slice(0, 10);
      try {
        if (storage.getItem(birthdayKey) !== today) {
          storage.setItem(birthdayKey, today);
          return "birthday";
        }
      } catch {
        /* fall through */
      }
    }

    const key = `dodi-last-long-greeting-${kidId}`;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (storage.getItem(key) === today) return "short";
      storage.setItem(key, today);
      return "long";
    } catch {
      return "long";
    }
  }

  // -------------------------------------------------------------------------
  // Transition helpers
  // -------------------------------------------------------------------------

  function transitionToActive(): void {
    if (!client || !currentKidId) return;

    set({ state: "active", gestureNeeded: false, error: null });
    voiceMeterStart();

    // A fresh socket knows nothing beyond its system instruction — replay a
    // compact recap of this run's conversation so the companion keeps
    // continuity across socket swaps (pooled deaf cycles) and sleep→wake.
    if (!socketHasHistory) {
      socketHasHistory = true;
      const recapText = recap.build();
      if (recapText) client.sendContext(recapText);
    }

    if (!greetingSent) {
      greetingSent = true;
      if (!sessionStartedAt) {
        sessionStartedAt = new Date().toISOString();
        startExitListener();
      }

      if (!hasGreetedThisRun) {
        hasGreetedThisRun = true;
        const mode = getGreetingMode(currentKidId, sessionIsBirthday);
        client.sendGreeting(mode);
      }
    }

    // No game-state catch-up: state is never pushed to the model — it reads the
    // host-buffered current state on demand via read_game_state.

    resetInactivityTimer();
    startInteractionListeners();

    void startMic();
  }

  function transitionToDeaf(manual: boolean): void {
    voiceMeterStop();
    recorder?.stop();
    recorder = null;
    streamer?.stop();

    // Pooled strategy (xAI): the active socket is tainted — it carried audio, so
    // the provider bills it for as long as it stays open, silent or not. Closing
    // it stops the clock; a warm standby takes its place on the next activation.
    if (sessionStrategy === "pooled" && client) {
      flushRound();
      clearPendingBridgeCalls();
      clearClientCallTimeout();
      pendingClientCall = null;
      if (pool) {
        pool.retire(client);
      } else {
        client.disconnect();
      }
      client = null;
      turnBuffer = "";
    }

    set({
      state: "deaf",
      gestureNeeded: !manual,
      dodiSpeaking: false,
    });

    // Keep inactivity timer running — if no interaction for 5 min in deaf mode, sleep
    resetInactivityTimer();
  }

  /**
   * The connecting→active/deaf decision shared by every path that brings a
   * session up: persisted deaf comes up deaf directly (manual-style, so an
   * incidental click can't wake it); otherwise try to resume audio output
   * without a gesture — success means active, failure means deaf with
   * gestureNeeded (any click then wakes it). Persistent sockets run this from
   * their `setupComplete` event; pooled sessions after `pool.whenReady()`.
   *
   * The persisted target is resolved HERE rather than handed in by the caller:
   * `connect` and `setContext` both raise sessions, and a connect superseded by
   * a navigation returns early — a flag it set would then be missing or stale.
   */
  function decideInitialPresence(kidId: string, generation: number): void {
    const isStale = (): boolean => generation !== contextGeneration || currentKidId !== kidId;

    void (async () => {
      const { startDeaf, startMuted } = await presence.resolveStart(kidId);
      if (isStale()) return;

      // Output mute is orthogonal to presence: apply it, but let the deaf/active
      // decision key on `startDeaf` alone (a muted kid may still be listening).
      set({ muted: startMuted });

      if (startDeaf) {
        transitionToDeaf(true);
        return;
      }
      // Captured across the await: cleanup() may null the ref, and a retired
      // speaker must not decide this session's presence.
      const activeStreamer = streamer;
      if (!activeStreamer) {
        transitionToDeaf(false);
        return;
      }

      const audioOk = await activeStreamer.tryResume();
      if (isStale() || streamer !== activeStreamer) return;

      if (!audioOk) {
        transitionToDeaf(false);
        return;
      }
      if (sessionStrategy === "pooled") {
        const acquired = await acquireActiveClient();
        if (acquired) transitionToActive();
      } else {
        transitionToActive();
      }
    })().catch((err: unknown) => {
      console.warn("[companion] voice bring-up failed:", err);
      // A superseded bring-up must not tear down the session that replaced it.
      if (isStale()) return;
      // Bring-up failed after the socket was up (e.g. the audio output could not
      // start). Leave "connecting" for good, or connect()'s "already connecting
      // for this kid" guard would skip every retry. Release the socket, pool and
      // speaker like a socket loss does.
      //
      // Fatal on purpose, like a failed config build in connect(): this is a
      // local device failure, not a network blip, so it would very likely repeat,
      // and the auto-connect effects reconnect any non-fatal "disconnected"
      // immediately, opening (and billing) a provider socket per round of a
      // hot-loop. Fatal stops the auto-retry; the kid's tap still reconnects
      // (connect() clears fatalError).
      teardownAfterSocketLoss({
        error: err instanceof Error && err.message ? err.message : "Failed to start voice",
        fatalError: true,
      });
    });
  }

  /**
   * Pooled strategy: take a warm socket from the pool and make it the session's
   * `client`. Usually instant (a standby is already setup-complete); when none
   * is ready yet (rapid toggling), the state dips to "connecting" until the
   * standby finishes its handshake. Returns false when superseded/destroyed
   * (silent) — pool-fatal failures surface through the pool's onFatal.
   */
  async function acquireActiveClient(): Promise<boolean> {
    const thisPool = pool;
    const kidId = currentKidId;
    if (!thisPool || !kidId) return false;
    const gen = contextGeneration;
    const isGameContext = get().context.type === "game";

    if (!thisPool.headReady) set({ state: "connecting" });
    try {
      const acquired = await thisPool.acquire(createEventHandler(kidId, gen, isGameContext));
      if (gen !== contextGeneration || pool !== thisPool || currentKidId !== kidId) {
        thisPool.retire(acquired);
        return false;
      }
      client = acquired;
      socketHasHistory = false;
      return true;
    } catch (err) {
      if (err instanceof VoiceSocketPoolError) {
        // superseded/destroyed are benign races; fatal already ran handlePoolFatal.
        return false;
      }
      if (gen !== contextGeneration || pool !== thisPool) return false;
      const message = err instanceof Error ? err.message : "Failed to activate voice";
      tapStartedAtMs = null;
      set({
        state: "disconnected",
        dodiSpeaking: false,
        gestureNeeded: false,
        error: message,
        fatalError: true,
      });
      return false;
    }
  }

  /**
   * The pool cannot provide sockets anymore (auth/quota/exhausted retries).
   * With a conversation running on an already-acquired socket, let it finish —
   * the failure surfaces when the next activation checks the pool. Otherwise
   * mirror the fatal-close teardown: fatal blocks auto-reconnect.
   */
  function handlePoolFatal(message: string): void {
    if (get().state === "active" && client) {
      console.warn("[VoicePool] fatal while a conversation is running:", message);
      return;
    }
    stopExitListener();
    cleanup();
    resetFlowFlags();
    set({
      state: "disconnected",
      dodiSpeaking: false,
      gestureNeeded: false,
      fatalError: true,
      error: message,
    });
  }

  function createPool(config: VoiceSessionConfig): VoiceSocketPool {
    const newPool: VoiceSocketPool = new VoiceSocketPool({
      config,
      createClient: services.createVoiceClient,
      onFatal: (message) => {
        if (pool !== newPool) return;
        handlePoolFatal(message);
      },
    });
    return newPool;
  }

  // -------------------------------------------------------------------------
  // Game read-aloud while deaf (speakGameVoiceText)
  // -------------------------------------------------------------------------

  function clearGameSpeechTimeout(): void {
    if (gameSpeechTimeout) {
      clearTimeout(gameSpeechTimeout);
      gameSpeechTimeout = null;
    }
  }

  /** Mark a read-aloud in flight, with a safety net that retires the borrowed
   *  pooled socket if the turn never reports completion. */
  function beginGameSpeech(): void {
    gameSpeechActive = true;
    clearGameSpeechTimeout();
    gameSpeechTimeout = setTimeout(() => {
      finishGameSpeech();
    }, GAME_SPEECH_MAX_MS);
  }

  /**
   * End an in-flight read-aloud. Pooled sockets are billed once tainted by the
   * audio they just produced, so the borrowed socket is retired the moment the
   * turn ends; persistent sockets simply stay open (normal deaf behavior). Only
   * touches the socket while still deaf — if the kid activated meanwhile, the
   * active path now owns `client`. Idempotent.
   */
  function finishGameSpeech(): void {
    if (!gameSpeechActive) return;
    gameSpeechActive = false;
    clearGameSpeechTimeout();
    if (get().state === "deaf" && sessionStrategy === "pooled" && client) {
      flushRound();
      if (pool) {
        pool.retire(client);
      } else {
        client.disconnect();
      }
      client = null;
      // Retiring the socket doesn't cut the queued voice; it plays out.
      endSpeakingAfterPlayback();
    }
  }

  /**
   * Pooled (xAI) deaf read-aloud: there is no socket while deaf, so borrow a warm
   * one for this single turn, speak, and let `finishGameSpeech` retire it. Every
   * await is guarded against the kid activating, muting, switching, or navigating
   * mid-flight. Best-effort: the game already got ok:true, so failures are silent.
   */
  async function speakOnEphemeralSocket(prompt: string): Promise<void> {
    const kidId = currentKidId;
    const gen = contextGeneration;
    const thisPool = pool;
    if (!kidId || !thisPool) {
      finishGameSpeech();
      return;
    }

    // A deaf session may hold a suspended audio output (it came up deaf without
    // a gesture). Scheduling audio into it would never sound, so bail quietly
    // rather than burn a socket on inaudible speech.
    const audioOk = (await streamer?.tryResume()) ?? false;
    if (
      !audioOk ||
      gen !== contextGeneration ||
      currentKidId !== kidId ||
      get().state !== "deaf" ||
      get().muted ||
      !gameSpeechActive
    ) {
      finishGameSpeech();
      return;
    }

    try {
      const isGameContext = get().context.type === "game";
      const acquired = await thisPool.acquire(createEventHandler(kidId, gen, isGameContext));
      if (
        gen !== contextGeneration ||
        pool !== thisPool ||
        currentKidId !== kidId ||
        get().state !== "deaf" ||
        get().muted ||
        !gameSpeechActive
      ) {
        thisPool.retire(acquired);
        finishGameSpeech();
        return;
      }
      client = acquired;
      // One-shot verbatim read-aloud: skip the conversation recap (no turn to
      // continue, and it would only cost tokens).
      socketHasHistory = true;
      client.sendText(prompt);
    } catch {
      // Superseded / destroyed / fatal pool — nothing to report back through the
      // one-shot sandbox reply.
      finishGameSpeech();
    }
  }

  /**
   * Pooled strategy: an ACTIVE socket died unexpectedly (network blip, server
   * kill). Instead of tearing the session down, retire it and promote a warm
   * standby — the conversation resumes in about a second (with recap). Rate
   * limited; systematic failures fall through to the normal teardown, where the
   * pages' auto-reconnect remains the backstop. Returns whether recovery started.
   */
  function tryFastRecovery(): boolean {
    if (sessionStrategy !== "pooled") return false;
    if (get().state !== "active") return false;
    if (!pool || pool.hasFatalError) return false;
    if (Date.now() - lastFastRecoveryAt < FAST_RECOVERY_MIN_INTERVAL_MS) return false;
    lastFastRecoveryAt = Date.now();
    console.info("[VoicePool] active socket dropped — promoting a warm standby");

    voiceMeterStop();
    recorder?.stop();
    recorder = null;
    streamer?.stop();
    flushRound();
    clearPendingBridgeCalls();
    clearClientCallTimeout();
    pendingClientCall = null;
    if (client) {
      pool.retire(client);
      client = null;
    }
    turnBuffer = "";
    set({ dodiSpeaking: false });

    void (async () => {
      const acquired = await acquireActiveClient();
      if (acquired) transitionToActive();
    })();
    return true;
  }

  async function startMic(): Promise<void> {
    if (get().state !== "active") return;
    if (micRequestInFlight) return;
    if (!currentKidId) return;

    micRequestInFlight = true;

    try {
      // Opening the microphone may wait on a permission prompt. The recorder
      // only becomes the session's once it is live AND the session is still
      // active, so a deaf/teardown during the prompt never leaks a live mic.
      const rec = audio.createRecorder();
      await rec.start((base64Pcm: string) => {
        client?.sendAudio(base64Pcm);
      });

      if (get().state !== "active") {
        rec.stop();
        return;
      }

      recorder?.stop();
      recorder = rec;
      set({ error: null });
    } catch (err) {
      if (isMicrophoneError(err)) {
        set({
          error: err.reason === "permission-denied" ? "micPermissionNeeded" : "secureContextRequired",
        });
      } else {
        const message = err instanceof Error ? err.message : "Microphone unavailable";
        set({ error: message });
      }
    } finally {
      micRequestInFlight = false;
    }
  }

  /** Disconnect the active socket ahead of a context switch (pool keeps warming). */
  function dropActiveClient(): void {
    if (!client) return;
    // Pooled: retire through the pool so the close stays internal and a
    // replacement standby is warmed.
    if (sessionStrategy === "pooled" && pool) {
      pool.retire(client);
    } else {
      client.disconnect();
    }
    client = null;
  }

  // -------------------------------------------------------------------------
  // Store
  // -------------------------------------------------------------------------

  store = createStore<CompanionSessionState>()((setState, getState) => ({
    displayMode: "full",
    context: { type: "home" },

    kidId: null,
    state: "disconnected",
    muted: false,
    dodiSpeaking: false,
    gestureNeeded: false,
    error: null,
    fatalError: false,

    chatMessages: [],
    chatSubmitting: false,

    onRunCommands: null,
    onRequestSnapshot: null,
    aiActivity: { image: 0, thinking: 0, writing: 0 },

    speakGameVoiceText: (text) => {
      const st = getState();
      // Output mute wins over everything — games can never force audio.
      if (st.muted) return { ok: false, error: "voice_unavailable" };

      gameDebug("voice", `speakGameVoiceText (${text.length} chars)`);
      const prompt = READ_ALOUD_FRAME + text;

      // Live and listening: inject the read-aloud on the open socket.
      if (st.state === "active" && client) {
        resetInactivityTimer();
        client.sendText(prompt);
        return { ok: true };
      }

      // Deaf means "ears off, voice on": a game may still ask it to speak.
      if (st.state === "deaf") {
        resetInactivityTimer();
        if (sessionStrategy === "persistent") {
          // The socket stays open while deaf on the persistent strategy — inject
          // directly. Kick the audio output in case it went suspended.
          if (!client) return { ok: false, error: "voice_unavailable" };
          beginGameSpeech();
          void streamer?.tryResume();
          client.sendText(prompt);
          return { ok: true };
        }
        // Pooled (xAI): no socket while deaf — borrow one just for this turn.
        if (!pool || pool.hasFatalError) {
          return { ok: false, error: "voice_unavailable" };
        }
        beginGameSpeech();
        void speakOnEphemeralSocket(prompt);
        return { ok: true };
      }

      // sleep / disconnected / connecting: nothing to speak through.
      return { ok: false, error: "voice_unavailable" };
    },

    gameAssistanceCount: 0,
    resetGameAssistance: () => {
      gameAssistanceTurns = 0;
      setState({ gameAssistanceCount: 0 });
    },

    pendingNavigation: null,
    clearPendingNavigation: () => {
      setState({ pendingNavigation: null });
    },

    setDisplayMode: (mode) => {
      setState({ displayMode: mode });
    },

    setOnRunCommands: (handler) => {
      setState({ onRunCommands: handler });
    },

    setOnRequestSnapshot: (handler) => {
      setState({ onRequestSnapshot: handler });
    },

    beginAiActivity: (kind) => {
      setState((s) => ({ aiActivity: { ...s.aiActivity, [kind]: s.aiActivity[kind] + 1 } }));
    },

    endAiActivity: (kind) => {
      setState((s) => ({
        aiActivity: { ...s.aiActivity, [kind]: Math.max(0, s.aiActivity[kind] - 1) },
      }));
    },

    resolveClientCommand: (result) => {
      // Called by the play view when the app-side work behind a client tool call
      // (drawing generated, snapshot saved/shared) has landed or failed. Answers
      // the held-open call so the companion finally speaks one completion line.
      // No-ops for marker-triggered commands that never opened a tool call, and
      // for a call already resolved by the safety timeout.
      if (!pendingClientCall) return;
      clearClientCallTimeout();
      const call = pendingClientCall;
      pendingClientCall = null;
      gameDebug(
        "voice",
        `resolveClientCommand ${call.name} ok=${result.ok} → sending deferred response; playback backlog=${streamer?.backlogSeconds().toFixed(1)}s`,
      );
      if (result.ok) {
        client?.sendToolResponse(call.id, call.name, {
          ok: true,
          status: "done",
          message:
            result.message ??
            (call.name === "generate_drawing"
              ? "The coloring sheet is now on the canvas. In ONE short, cheerful sentence, tell the child it's ready to color in — do not repeat yourself."
              : "Done. In ONE short, cheerful sentence, tell the child it worked — do not repeat yourself."),
        });
      } else {
        client?.sendToolResponse(call.id, call.name, {
          ok: false,
          error:
            result.error ??
            "It could not be completed. In one short sentence, gently tell the child it didn't work this time.",
        });
      }
    },

    setContext: async (newContext, kidId) => {
      const current = getState();
      const oldContext = current.context;

      // If same context and same kid, just update gameState if needed
      if (!contextRequiresReconnect(oldContext, newContext)) {
        setState({ context: newContext });
        return;
      }

      // Don't reconnect when sleeping — kid must tap to wake
      if (current.state === "sleep") {
        setState({ context: newContext });
        return;
      }

      // Offline: record the context but skip the doomed reconnect. Deliberately
      // NOT fatal — the auto-connect effects retry when connectivity returns.
      if (!isOnline()) {
        setState({ context: newContext, state: "disconnected", error: null });
        return;
      }

      // Context requires reconnect (e.g., home/browse <-> game, or game <-> different game)
      const gen = ++contextGeneration;

      // Stop audio but don't fire memory update — transcript persists
      recorder?.stop();
      recorder = null;
      dropActiveClient();
      clearPendingBridgeCalls();
      turnBuffer = "";

      // Clear game-specific chat messages when entering a new game or leaving game
      setState({
        context: newContext,
        state: "connecting",
        dodiSpeaking: false,
        error: null,
        chatMessages: [],
        chatSubmitting: false,
        gestureNeeded: false,
      });

      // Reset flow flags for new connection
      greetingSent = false;

      const controller = new AbortController();
      abortController = controller;

      try {
        // Built on the device from the vault (E2EE): the server can't decrypt
        // the provider key. Mirrors connect().
        const config =
          newContext.type === "game"
            ? await services.buildGameVoiceConfig(kidId, newContext)
            : await services.buildHomeVoiceConfig(kidId);

        if (gen !== contextGeneration || controller.signal.aborted) return;

        sessionIsBirthday = config.isBirthday ?? false;
        sessionProvider = config.provider;
        sessionModel = config.model;
        const newStrategy = voiceSocketStrategy(config.provider);

        if (!streamer) {
          streamer = createStreamer();
        }

        if (newStrategy === "pooled") {
          if (pool && sessionStrategy === "pooled" && !pool.hasFatalError) {
            // Re-instruct the existing warm standbys in place — one JSON frame
            // per socket, no reconnect.
            sessionStrategy = newStrategy;
            await pool.updateConfig(config);
          } else {
            pool?.destroy();
            sessionStrategy = newStrategy;
            const newPool = createPool(config);
            pool = newPool;
            newPool.start();
            await newPool.whenReady();
          }
          if (gen !== contextGeneration || controller.signal.aborted) return;
          // Parity with the persistent path, which logs this from setupComplete
          // on every reconnect.
          logKidActivity(api, {
            kidId,
            event: "session_start",
            message: "Voice session started",
          });
          decideInitialPresence(kidId, gen);
        } else {
          pool?.destroy();
          pool = null;
          sessionStrategy = newStrategy;
          const isGameContext = newContext.type === "game";
          const handleEvent = createEventHandler(kidId, gen, isGameContext);
          client = services.createVoiceClient(config, handleEvent);
          socketHasHistory = false;
          client.connect();
        }
      } catch (err) {
        if (isAbortError(err)) return;
        // Pool aborts (superseded/destroyed) are benign races; pool-fatal
        // failures already surfaced through the pool's onFatal.
        if (err instanceof VoiceSocketPoolError) return;
        if (gen !== contextGeneration) return;
        const message = err instanceof Error ? err.message : "Failed to switch context";
        // Same as connect(): a failed config build won't recover on auto-retry,
        // so mark it fatal to stop the disconnected→reconnect hot-loop.
        setState({ state: "disconnected", error: message, fatalError: true });
      }
    },

    connect: async (kidId) => {
      if (!kidId) return;

      // Offline: stay disconnected quietly (sleeps). Deliberately NOT fatal —
      // the auto-connect effects retry when connectivity returns.
      if (!isOnline()) {
        setState({ kidId, state: "disconnected", error: null, fatalError: false });
        return;
      }

      const currentState = getState();

      // Already connecting or connected for this kid
      if (
        currentKidId === kidId &&
        (currentState.state === "connecting" ||
          currentState.state === "active" ||
          currentState.state === "deaf")
      ) {
        return;
      }

      if (currentKidId && currentKidId !== kidId) {
        // Different kid — teardown; the recap must never cross kids.
        stopExitListener();
        cleanup();
        resetFlowFlags();
        recap.reset();
      }

      stopExitListener();
      cleanup();

      // DB-first transcripts: start today's day model, seed it from the stored
      // mirror + flush any outbox backlog, then process unprocessed past days
      // into memory. Sequential inside flushAndProcessMemory so the memory
      // update sees the freshly flushed rows.
      transcripts.beginDay(kidId);
      flushAndProcessMemory(kidId);
      roundRole = null;
      roundText = "";
      roundStartedAt = null;

      currentKidId = kidId;
      sessionStartedAt = null;
      greetingSent = false;
      micRequestInFlight = false;

      // Bind the volume store to this kid so the volume control and the speaker
      // agree on (and persist to) the same per-kid level.
      stores.companionVolume.getState().bindKid(kidId);

      const gen = ++contextGeneration;
      const controller = new AbortController();
      abortController = controller;

      setState({
        kidId,
        state: "connecting",
        // Cleared while connecting; re-derived from this kid's row in
        // decideInitialPresence so a previous kid's mute can't linger.
        muted: false,
        dodiSpeaking: false,
        gestureNeeded: false,
        error: null,
        fatalError: false,
      });

      try {
        // The persisted deaf target is NOT resolved here: a navigation can
        // supersede this connect at any await below, and the session it hands
        // over to must read the kid row itself. decideInitialPresence owns it.
        const currentContext = getState().context;
        const config =
          currentContext.type === "game"
            ? await services.buildGameVoiceConfig(kidId, currentContext)
            : await services.buildHomeVoiceConfig(kidId);

        if (gen !== contextGeneration || controller.signal.aborted) return;

        sessionIsBirthday = config.isBirthday ?? false;
        sessionProvider = config.provider;
        sessionModel = config.model;
        sessionStrategy = voiceSocketStrategy(config.provider);

        streamer = createStreamer();

        if (sessionStrategy === "pooled") {
          lastFastRecoveryAt = 0;
          const newPool = createPool(config);
          pool = newPool;
          newPool.start();
          await newPool.whenReady();
          if (gen !== contextGeneration || controller.signal.aborted) return;
          // Insights: voice session connected (dashboard counts session_start).
          // Persistent sockets log this from their setupComplete event.
          logKidActivity(api, {
            kidId,
            event: "session_start",
            message: "Voice session started",
          });
          decideInitialPresence(kidId, gen);
        } else {
          const isGameContext = currentContext.type === "game";
          const handleEvent = createEventHandler(kidId, gen, isGameContext);
          client = services.createVoiceClient(config, handleEvent);
          socketHasHistory = false;
          client.connect();
        }
      } catch (err) {
        if (isAbortError(err)) return;
        // Pool aborts (superseded/destroyed) are benign races; pool-fatal
        // failures already surfaced through the pool's onFatal.
        if (err instanceof VoiceSocketPoolError) return;
        if (gen !== contextGeneration) return;
        const message = err instanceof Error ? err.message : "Failed to connect";
        tapStartedAtMs = null;
        setState({
          state: "disconnected",
          dodiSpeaking: false,
          gestureNeeded: false,
          error: message,
          // Building the voice config failed (e.g. no voice model/provider/key
          // configured, vault locked). Blind auto-reconnect would re-throw and
          // hot-loop, so mark it fatal — the kid taps to retry once it's fixed.
          fatalError: true,
        });
      }
    },

    activate: async (options) => {
      // `deliberate` false is KidChrome's any-click gesture handler, which only
      // exists to lift the transient "audio needs a gesture" deaf. A kid who
      // deliberately turned listening off stays deaf until actually tapped
      // awake — an incidental click must neither wake it nor clear the toggle.
      const deliberate = options?.deliberate ?? true;
      const current = getState();
      if (current.state !== "deaf") return;
      if (!currentKidId) return;
      if (sessionStrategy === "persistent" && !client) return;
      if (!deliberate && presence.isPersisted(currentKidId, "deafened_dodi_at")) return;

      // A game read-aloud may be borrowing a pooled socket right now (deaf can
      // still speak). Retire it before acquiring the active socket so we don't
      // orphan it. No-op on the persistent strategy / when nothing is speaking.
      finishGameSpeech();

      // Prime audio output from the user gesture — must stay synchronous inside
      // the gesture (autoplay unlock), before any await below.
      if (!streamer) {
        streamer = createStreamer();
      }
      streamer.primeFromGesture();
      tapStartedAtMs = Date.now();

      if (sessionStrategy === "pooled") {
        // A pool that failed fatally while the last conversation was running
        // surfaces here, on the next deliberate wake.
        if (!pool || pool.hasFatalError) {
          handlePoolFatal(
            pool?.fatalErrorMessage ?? "dodi couldn't reach the voice provider. Please try again.",
          );
          return;
        }
        const acquired = await acquireActiveClient();
        if (!acquired) return;
      }

      transitionToActive();
      // The kid deliberately woke it → clear the persisted deaf state so the
      // next connect comes up listening. (No-ops if it wasn't set.) Output mute
      // is a separate toggle and is intentionally left as-is.
      if (deliberate) presence.persist("deafened_dodi_at", false, currentKidId);
    },

    deactivate: () => {
      const current = getState();
      if (current.state !== "active") return;

      transitionToDeaf(true);
      // The kid deliberately turned listening off → persist it so it stays deaf
      // across reconnects, navigations and reloads until re-enabled.
      presence.persist("deafened_dodi_at", true, currentKidId);
    },

    setMuted: (muted, kidId) => {
      if (getState().muted === muted) return;
      // Output-only: mute never changes whether it is listening (deaf/active),
      // only whether it can be heard. So it touches no session state beyond
      // cutting audio that is already playing or queued.
      setState({ muted });
      presence.persist("muted_dodi_at", muted, kidId ?? currentKidId);
      if (muted) {
        setState({ dodiSpeaking: false });
        streamer?.stop();
        // A game read-aloud in flight must fall silent immediately too.
        finishGameSpeech();
      }
    },

    toggleActive: () => {
      const current = getState();
      if (current.state === "active") {
        getState().deactivate();
      } else if (current.state === "deaf") {
        void getState().activate();
      } else if ((current.state === "disconnected" || current.state === "sleep") && current.kidId) {
        void getState().connect(current.kidId);
      }
      // connecting: no-op
    },

    endSession: () => {
      stopExitListener();

      // Leaving the kid view is a common exit right after toggling — retry the
      // parked presence toggles now (keepalive carries them past the navigation)
      // instead of waiting for the next bring-up. No-ops when nothing is parked.
      if (currentKidId) presence.flushAll(currentKidId);

      // Flush the in-progress round and push the outbox to the DB; memory
      // processing stays a connect-time concern.
      flushRound();
      if (currentKidId) void transcripts.flushNow(currentKidId);

      currentKidId = null;
      sessionStartedAt = null;
      hasGreetedThisRun = false;
      recap.reset();

      cleanup();
      resetFlowFlags();

      setState({
        kidId: null,
        state: "disconnected",
        // Re-derived from the kid row on the next connect; clearing it here stops
        // a stale mute leaking across a kid switch.
        muted: false,
        dodiSpeaking: false,
        gestureNeeded: false,
        error: null,
        chatMessages: [],
        chatSubmitting: false,
        pendingNavigation: null,
      });
    },

    processMemoryNow: (kidId) => {
      if (!kidId) return;

      // Flush the in-progress round, push the outbox to the DB, then process
      // everything including today's still-open transcript.
      if (currentKidId === kidId) flushRound();
      flushAndProcessMemory(kidId, { includeToday: true });
    },

    sendTextMessage: async (message, gameId) => {
      const trimmed = message.trim();
      if (!trimmed || !currentKidId) return;

      const current = getState();
      if (current.chatSubmitting) return;

      // A text turn during game play also counts as "asking the companion".
      if (gameId) {
        gameAssistanceTurns += 1;
        setState({ gameAssistanceCount: gameAssistanceTurns });
      }

      // Add kid message
      const kidMsg: CompanionMessage = { id: createMessageId(), role: "kid", text: trimmed };
      setState({
        chatMessages: [...current.chatMessages, kidMsg].slice(-MAX_MESSAGES),
        chatSubmitting: true,
      });

      const gameContext = current.context.type === "game" ? current.context : null;
      if (!gameContext) {
        setState({ chatSubmitting: false });
        return;
      }

      try {
        // Runs fully on the device: the child's data + persona soul are E2EE and
        // the thinking key lives only in the unlocked vault, so the server can
        // neither assemble the prompt nor run this. Mirrors the voice companion.
        const data = await services.runGameTextAssistant(currentKidId, gameContext, trimmed);

        gameDebug("text", "Assistant response:", {
          reply: data.reply?.slice(0, 100),
          commandCount: data.commands?.length ?? 0,
        });

        const newMessages = [...getState().chatMessages];
        if (data.reply) {
          newMessages.push({ id: createMessageId(), role: "dodi", text: data.reply });
        }
        setState({ chatMessages: newMessages.slice(-MAX_MESSAGES), chatSubmitting: false });

        // Route commands to sandbox
        const { onRunCommands } = getState();
        if (data.commands?.length && onRunCommands) {
          onRunCommands(data.commands);
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Assistant failed";
        const newMessages = [...getState().chatMessages];
        newMessages.push({ id: createMessageId(), role: "dodi", text: `Error: ${errorMsg}` });
        setState({ chatMessages: newMessages.slice(-MAX_MESSAGES), chatSubmitting: false });
      }
    },

    updateGameState: (gameState) => {
      const current = getState();
      if (current.context.type !== "game") return;

      // The host buffers the current game state; the voice model is never pushed
      // to — it fetches on demand via read_game_state / analyze_game_state.
      setState({
        context: { ...current.context, gameState },
      });

      // A bridge tool call is waiting for its outcome: the first state event
      // after the command is its observation — answer with the updated state.
      const pending = pendingBridgeCalls.shift();
      if (pending) {
        clearTimeout(pending.timer);
        gameDebug("voice", `Resolving deferred ${pending.name} with post-command state`);
        client?.sendToolResponse(pending.id, pending.name, { ok: true, state: gameState });
      }
    },
  }));

  // -------------------------------------------------------------------------
  // Voice events
  // -------------------------------------------------------------------------

  /** launch_game: navigate to a game or a filtered library (never to raw model text). */
  function handleLaunchGame(event: Extract<VoiceEvent, { type: "toolCall" }>): void {
    const gameId = typeof event.args.game_id === "string" ? event.args.game_id.trim() : "";
    const searchQuery = typeof event.args.search_query === "string" ? event.args.search_query : "";
    const tag = typeof event.args.tag === "string" ? event.args.tag : "";

    let navPath: string;
    let action: string;

    if (gameId) {
      // `game_id` is model output, not a trusted id: models regularly answer
      // with the game's TITLE (slugified) instead of the catalog UUID. Resolve
      // it against the kid's decrypted library and refuse to navigate on
      // anything unresolvable — the raw string must never become a URL.
      const catalog = currentKidId ? stores.games.getState().byKid[currentKidId] : undefined;
      const target = resolveLaunchGameTarget(gameId, catalog ?? []);
      const ctxNow = get().context;
      const openGameId = ctxNow.type === "game" ? ctxNow.gameId : null;
      const resolvedId =
        target.kind === "game" ? target.id : !catalog && isUuidLike(gameId) ? gameId : null;
      if (resolvedId && openGameId && resolvedId === openGameId) {
        // "Again!" / the current title as game_id: the child is already in this
        // game. Re-navigating would remount it (and drop the autosaved state) —
        // answer instead of moving.
        gameDebugWarn("voice", "launch_game: target is the open game — not navigating");
        client?.sendToolResponse(event.id, event.name, {
          ok: false,
          error: "already_open",
          message:
            "That game is already open, so nothing was launched. If the child wants to start over, " +
            "use restart_game when it is available; otherwise say you cannot restart it from here.",
        });
        return;
      }
      if (target.kind === "game") {
        navPath = `/games/${target.id}`;
        action = "navigating_to_game";
      } else if (target.kind === "ambiguous") {
        navPath = `/games?${new URLSearchParams({ search: target.query }).toString()}`;
        action = "showing_matching_games";
      } else if (!catalog && isUuidLike(gameId)) {
        // No library in the cache to validate against (cold session); a
        // well-formed id is the best we can do — the play page 404s gracefully
        // if it is stale.
        navPath = `/games/${gameId}`;
        action = "navigating_to_game";
      } else {
        gameDebugWarn("voice", `launch_game: unknown game_id "${gameId}" — not navigating`);
        client?.sendToolResponse(event.id, event.name, {
          ok: false,
          error: "unknown_game_id",
          message:
            `No game with id "${gameId}" is in the catalog, so nothing was opened. ` +
            "Pass the exact value from the id column of the Available Games table (never the title), " +
            "or use search_query to show the child matching games.",
        });
        return;
      }
    } else if (searchQuery || tag) {
      const params = new URLSearchParams();
      if (searchQuery) params.set("search", searchQuery);
      if (tag) params.set("tag", tag);
      navPath = `/games?${params.toString()}`;
      action = "showing_matching_games";
    } else {
      navPath = "/games";
      action = "showing_all_games";
    }

    set({ pendingNavigation: navPath });

    client?.sendToolResponse(event.id, event.name, {
      ok: true,
      action,
    });
  }

  /** A standardized bridge/client game command from a tool call. */
  function handleGameCommandTool(event: Extract<VoiceEvent, { type: "toolCall" }>): void {
    // First-class standardized game command → forward to the sandbox as a
    // {type, payload} bridge command (the play view intercepts client-kind
    // commands such as generate_drawing before they reach the sandbox).
    const command: GameCommand = {
      type: event.name,
      payload: event.args as GameCommand["payload"],
    };
    gameDebug("voice", "Executing game command from tool call:", command);
    const { onRunCommands } = get();
    if (onRunCommands) {
      onRunCommands([command]);
    }

    if (STANDARD_TOOLS_BY_NAME[event.name].kind === "client") {
      // Client-intercepted (generate_drawing, save_snapshot, share_snapshot):
      // the app-side work takes a few seconds. HOLD the tool response open
      // until it lands — while a function call is pending the native-audio
      // model produces no audio, so the companion stays silent instead of
      // looping filler. The play view calls resolveClientCommand().
      clearClientCallTimeout();
      pendingClientCall = { id: event.id, name: event.name };
      gameDebug(
        "voice",
        `${event.name} → DEFERRING response; playback backlog=${streamer?.backlogSeconds().toFixed(1)}s`,
      );
      // Flush the playback backlog so the pending window is actually silent;
      // the deferred response then drives one clean completion line.
      streamer?.stop();
      set({ dodiSpeaking: false });
      clientCallTimeoutTimer = setTimeout(
        () => {
          if (!pendingClientCall) return;
          gameDebugWarn("voice", `${pendingClientCall.name} timed out — sending fallback response`);
          client?.sendToolResponse(pendingClientCall.id, pendingClientCall.name, {
            ok: false,
            error:
              "It took too long and timed out. In one short sentence, gently tell the child it didn't work this time.",
          });
          pendingClientCall = null;
          clientCallTimeoutTimer = null;
        },
        CLIENT_CALL_TIMEOUT_MS[event.name] ?? CLIENT_CALL_TIMEOUT_FALLBACK_MS,
      );
    } else {
      // Bridge command → DEFER the response until the game's next state event,
      // so the model observes the command's outcome in the tool response itself.
      // Resolved FIFO in updateGameState; the timeout is the safety net for
      // games that emit no state event.
      const callId = event.id;
      const callName = event.name;
      const timer = setTimeout(() => {
        const idx = pendingBridgeCalls.findIndex((c) => c.id === callId);
        if (idx === -1) return;
        pendingBridgeCalls.splice(idx, 1);
        gameDebugWarn("voice", `${callName} produced no state event — sending plain ok`);
        client?.sendToolResponse(callId, callName, {
          ok: true,
          command: callName,
        });
      }, BRIDGE_CALL_TIMEOUT_MS);
      pendingBridgeCalls.push({ id: callId, name: callName, timer });
    }
  }

  /** analyze_game_state: offload complex state analysis to the thinking model. */
  function handleAnalyzeGameState(
    event: Extract<VoiceEvent, { type: "toolCall" }>,
    kidId: string,
  ): void {
    const question =
      typeof event.args.question === "string"
        ? event.args.question
        : "What is the current game state?";

    gameDebug("voice", `analyze_game_state: "${question}"`);

    const ctx = get().context;
    if (ctx.type !== "game") {
      client?.sendToolResponse(event.id, event.name, {
        ok: false,
        error: "Not in a game context",
      });
      return;
    }

    // The whole analysis runs ON THE DEVICE: the provider key is E2EE (only the
    // vault can decrypt it), so we resolve the thinking provider/model/key here
    // and call the provider directly — nothing touches our servers. Also grab a
    // fresh canvas snapshot when the game supports get_snapshot (gated to avoid
    // the 3s requestSnapshot timeout for games with no visual surface).
    void (async () => {
      try {
        const thinking = await stores.execution.resolveThinking();
        if (!thinking) {
          client?.sendToolResponse(event.id, event.name, {
            ok: false,
            error:
              "No thinking model is configured, so I can't look closely right now. " +
              "Answer briefly from what you already know about the game state.",
          });
          return;
        }

        // Show the companion's "thinking" state for the whole analysis window
        // (snapshot grab + provider call), cleared even on throw.
        const { analysis, usage } = await withAiActivity("thinking", async () => {
          const snapshotHandler = get().onRequestSnapshot;
          const snapshot =
            snapshotHandler && ctx.capabilities.includes("get_snapshot")
              ? await snapshotHandler().catch(() => null)
              : null;
          if (snapshot) {
            gameDebug("voice", `analyze_game_state: got snapshot (${snapshot.length} chars)`);
          }

          const kid = await stores.kids.getState().loadOne(kidId);
          return services.analyzeGameState({
            provider: thinking.provider,
            model: thinking.model,
            apiKey: thinking.apiKey,
            gameState: ctx.gameState,
            question,
            gameMarkdown: ctx.markdown,
            gameCodeBundle: ctx.codeBundle,
            snapshot,
            childName: kid?.display_name,
            language: getLanguageDisplayName(kid?.language ?? "en"),
          });
        });
        reportUsage({
          eventType: "game_analysis",
          kidId,
          // usage rows FK games — snapshot sessions attribute to no game.
          gameId: ctx.snapshotId ? null : ctx.gameId,
          provider: thinking.provider,
          model: thinking.model,
          usage,
        });
        gameDebug("voice", `analyze_game_state result: "${analysis.slice(0, 200)}"`);
        client?.sendToolResponse(event.id, event.name, {
          ok: true,
          analysis,
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Analysis failed";
        gameDebugWarn("voice", `analyze_game_state failed: ${errMsg}`);
        client?.sendToolResponse(event.id, event.name, {
          ok: false,
          error: `Analysis failed: ${errMsg}. Respond based on what you know from the game state.`,
        });
      }
    })();
  }

  /** Socket died or errored: tear the session down to disconnected. */
  function teardownAfterSocketLoss(update: Partial<CompanionSessionState>): void {
    stopExitListener();
    cleanup();
    resetFlowFlags();
    set({
      state: "disconnected",
      dodiSpeaking: false,
      gestureNeeded: false,
      ...update,
    });
  }

  function createEventHandler(
    kidId: string,
    generation: number,
    isGameContext: boolean,
  ): (event: VoiceEvent) => void {
    return (event: VoiceEvent): void => {
      if (generation !== contextGeneration) return;
      if (currentKidId !== kidId) return;

      switch (event.type) {
        case "setupComplete": {
          // Persistent sockets only — pooled sockets complete setup inside the
          // pool and arrive here already ready (this event never fires for them).
          // Insights: voice session connected (dashboard counts session_start).
          logKidActivity(api, {
            kidId,
            event: "session_start",
            message: "Voice session started",
          });
          decideInitialPresence(kidId, generation);
          break;
        }

        case "audio": {
          // Output mute drops audio unconditionally — it may still hear and
          // think, it just can't be heard. Never flag it as speaking.
          if (get().muted) return;
          // Deaf normally produces no audio, but a game read-aloud is the one
          // exception (ears off, voice on) — and it runs on a session that may
          // never have greeted, so it also bypasses the greeting gate.
          const deafGameSpeech = gameSpeechActive && get().state === "deaf";
          if (!greetingSent && !deafGameSpeech) return;
          if (get().state !== "active" && !deafGameSpeech) return;
          turnAudioChunks++;
          if (turnAudioChunks === 1) {
            gameDebug("voice", "First audio chunk this turn");
          }
          // [TEMP DEBUG drawing-repeat] Is the model producing NEW audio while a
          // client tool call is held open? If so, deferral isn't keeping it silent.
          if (pendingClientCall) {
            gameDebug(
              "voice",
              `⚠ NEW audio chunk #${turnAudioChunks} while ${pendingClientCall.name} PENDING (backlog=${streamer?.backlogSeconds().toFixed(1)}s)`,
            );
          }
          if (tapStartedAtMs !== null) {
            const elapsed = Math.round(Date.now() - tapStartedAtMs);
            tapStartedAtMs = null;
            console.info("tap_to_first_audio_ms", elapsed);
          }
          modelTurnComplete = false;
          set({ dodiSpeaking: true });
          streamer?.enqueue(event.data);
          break;
        }

        case "text":
          if (!greetingSent) return;
          // `text` is native-audio model metadata, not a clean transcript — the
          // spoken words arrive via `outputTranscription`. Use it only to feed
          // the game command-marker buffer.
          if (isGameContext) {
            turnBuffer += event.text;
          }
          break;

        case "inputTranscription":
          if (!greetingSent) return;
          resetInactivityTimer();
          // A new kid run (role switch) counts as one "asking" turn while a game
          // is open — counted per round, not per streamed fragment.
          if (isGameContext && roundRole !== "kid") {
            gameAssistanceTurns += 1;
            set({ gameAssistanceCount: gameAssistanceTurns });
          }
          appendRoundFragment("kid", event.text);
          break;

        case "outputTranscription":
          // A deaf read-aloud runs without a greeting; keep its transcript so the
          // conversation record stays complete. (Muted+active still greeted, so
          // its inaudible replies are recorded as usual.)
          if (!greetingSent && !gameSpeechActive) return;
          appendRoundFragment("dodi", event.text);
          break;

        case "toolCall": {
          gameDebug("voice", `Tool call: ${event.name}(${JSON.stringify(event.args)})`);
          const toolKind = STANDARD_TOOLS_BY_NAME[event.name]?.kind;

          if (event.name === "launch_game") {
            handleLaunchGame(event);
          } else if (isGameContext && (toolKind === "bridge" || toolKind === "client")) {
            handleGameCommandTool(event);
          } else if (event.name === "read_game_state" && isGameContext) {
            // Instant host answer: the current structured state the game last
            // pushed to the host — no AI call, no snapshot.
            const ctx = get().context;
            if (ctx.type !== "game") {
              client?.sendToolResponse(event.id, event.name, {
                ok: false,
                error: "Not in a game context",
              });
              return;
            }
            gameDebug("voice", "read_game_state → returning current state");
            client?.sendToolResponse(event.id, event.name, {
              ok: true,
              state: ctx.gameState,
            });
          } else if (event.name === "analyze_game_state" && isGameContext) {
            handleAnalyzeGameState(event, kidId);
          } else {
            gameDebugWarn("voice", `Unknown or unavailable tool: ${event.name}`);
            client?.sendToolResponse(event.id, event.name, {
              ok: false,
              error: `Tool not available in current context`,
            });
          }
          break;
        }

        case "turnComplete": {
          turnNumber++;
          gameDebug(
            "voice",
            `[T${turnNumber}] Complete: audio=${turnAudioChunks}, text="${turnBuffer.trim().slice(0, 200)}"`,
          );

          // Reset per-turn counters
          turnAudioChunks = 0;

          // A deaf read-aloud completes here too (it may have no greeting) — end
          // it before the greeting gate so the borrowed pooled socket is retired
          // and the speaking indicator clears once the read-aloud has played out.
          if (gameSpeechActive) {
            endSpeakingAfterPlayback();
            finishGameSpeech();
          }

          if (!greetingSent) return;
          // Generation is done, but the voice may still be queued for seconds.
          endSpeakingAfterPlayback();

          // End of the model's turn — finalize the current round as one entry.
          flushRound();

          if (isGameContext) {
            const text = turnBuffer.trim();
            turnBuffer = "";

            // Only extract command markers from voice text — never add raw text
            // to chat (voice text is model thinking/metadata, not user-facing).
            if (text) {
              const { commands } = extractCommandMarkers(text);
              if (commands.length > 0) {
                gameDebug("voice", `Marker-based commands: ${commands.length}`);
                const { onRunCommands } = get();
                if (onRunCommands) {
                  onRunCommands(commands);
                }
              }
            }
          }
          break;
        }

        case "interrupted": {
          const wasGameSpeech = gameSpeechActive;
          if (wasGameSpeech) finishGameSpeech();
          if (!greetingSent && !wasGameSpeech) return;
          set({ dodiSpeaking: false });
          streamer?.stop();
          break;
        }

        case "error": {
          // Pooled + active: the retire inside recovery swallows the `closed`
          // that usually follows a socket error, so recovering here covers both
          // the error→closed sequence and error-only server hiccups.
          if (tryFastRecovery()) break;
          const st = get().state;
          const wasConnected = st === "connecting" || st === "active" || st === "deaf";
          teardownAfterSocketLoss({ error: wasConnected ? event.error : null });
          break;
        }

        case "closed": {
          if (!event.fatal && tryFastRecovery()) break;
          const st = get().state;
          const wasConnected = st === "connecting" || st === "active" || st === "deaf";
          teardownAfterSocketLoss({
            // Fatal closes (quota, auth) surface their message and block auto-reconnect.
            fatalError: event.fatal,
            error: event.fatal ? event.message : wasConnected ? event.message : null,
          });
          break;
        }
      }
    };
  }

  // Push live volume changes into the playing speaker's master gain. A null
  // speaker (idle) picks the level up at its next creation via createStreamer().
  stores.companionVolume.subscribe((s) => {
    streamer?.setVolume(s.volume);
  });

  return {
    store,
    outputLevel: () => streamer?.outputLevel() ?? 0,
  };
}
