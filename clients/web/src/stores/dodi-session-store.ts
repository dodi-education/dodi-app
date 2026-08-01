import { create } from "zustand";

import { dodi } from "@/lib/api";
import { createVoiceClient } from "@/lib/ai/create-voice-client";
import type {
  VoiceClient,
  VoiceEvent,
  VoiceSocketStrategy,
  VoiceToolDeclaration,
} from "@/lib/ai/voice-client";
import { voiceSocketStrategy } from "@/lib/ai/voice-client";
import { VoiceSocketPool, VoiceSocketPoolError } from "@/lib/ai/voice-socket-pool";
import {
  buildRecapContext,
  recordRecapRound,
  resetRecap,
} from "@/lib/ai/session-recap";
import { AudioStreamer } from "@/lib/ai/audio-streamer";
import { AudioRecorder } from "@/lib/ai/audio-recorder";
import { buildGameVoiceConfig, buildHomeVoiceConfig } from "@/lib/ai/voice-session";
import { runClientMemoryUpdate } from "@/lib/ai/client-memory-update";
import {
  beginDay,
  flushNow,
  recordRound,
  syncAndSeed,
} from "@/lib/ai/transcript-sync";
import { logKidActivity } from "@/lib/activities/log-activity";
import { reportUsage } from "@/lib/usage/report-usage";
import { runGameTextAssistant } from "@/lib/ai/client-game-assistant";
import { resolveClientThinking } from "@/lib/ai/resolve-client-thinking";
import { isCurrentlyOnline } from "@/stores/connectivity-store";
import { useKidStore } from "@/stores/kid-store";
import { analyzeGameState } from "@dodi/ai/game-analysis";
import { getLanguageDisplayName } from "@dodi/ai/dodi-context";
import { extractCommandMarkers } from "@dodi/games/command-markers";
import { gameDebug, gameDebugWarn } from "@dodi/games/debug";
import { STANDARD_TOOLS_BY_NAME } from "@dodi/games/toolbox";
import type { AIProviderId } from "@dodi/types/ai";
import type { GameCommand } from "@dodi/types/games";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DodiDisplayMode = "full" | "compact";

export type DodiContext =
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

export type DodiState = "disconnected" | "connecting" | "active" | "deaf" | "sleep";

// In-game AI provider work the companion should visibly "think" through.
// "image" = image provider (drawing); "writing" = thinking provider filling
// game content slots (generate_text); "thinking" = thinking provider
// (game-state analysis, and future in-game text assistant).
export type DodiActivity = "image" | "thinking" | "writing";

export interface CompanionMessage {
  id: string;
  role: "kid" | "dodi";
  text: string;
}

interface GameVoiceSessionConfig {
  provider: AIProviderId;
  apiKey: string;
  model: string;
  voiceName: string;
  systemInstruction: string;
  tools?: VoiceToolDeclaration[];
  isBirthday?: boolean;
}

export interface DodiSessionState {
  // Display
  displayMode: DodiDisplayMode;
  context: DodiContext;

  // Core state
  kidId: string | null;
  state: DodiState;
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
  // calls don't clear the state early. Flip via withAiActivity / begin/endAiActivity.
  aiActivity: Record<DodiActivity, number>;
  beginAiActivity: (kind: DodiActivity) => void;
  endAiActivity: (kind: DodiActivity) => void;
  // Release a held-open client tool call (generate_drawing, generate_text,
  // save_snapshot, share_snapshot) once the app-side work finished (or failed). Dodi stays
  // silent while the call is pending, then speaks one completion line driven by
  // `message`/`error`. See the client-kind tool-call branch.
  resolveClientCommand: (result: {
    ok: boolean;
    message?: string;
    error?: string;
  }) => void;

  // Count of kid turns ("asking Dodi") while a game is open — feeds the
  // hintsUsed metric for success evaluation. Reset per play by the play view.
  gameAssistanceCount: number;
  resetGameAssistance: () => void;

  // Navigation (set by launch_game tool, consumed by layout)
  pendingNavigation: string | null;
  clearPendingNavigation: () => void;

  // Actions
  setContext: (context: DodiContext, kidId: string) => Promise<void>;
  setDisplayMode: (mode: DodiDisplayMode) => void;
  connect: (kidId: string) => Promise<void>;
  activate: () => Promise<void>;
  deactivate: () => void;
  toggleActive: () => void;
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
export const selectDodiThinking = (s: DodiSessionState): boolean =>
  s.aiActivity.image > 0 || s.aiActivity.thinking > 0 || s.aiActivity.writing > 0;

// Which activity's copy to show; image wins over writing over thinking.
export const selectDodiActivityKind = (s: DodiSessionState): DodiActivity | null =>
  s.aiActivity.image > 0
    ? "image"
    : s.aiActivity.writing > 0
      ? "writing"
      : s.aiActivity.thinking > 0
        ? "thinking"
        : null;

// Wrap any in-game AI provider call so the companion shows its "thinking" state
// for the call's whole lifetime, cleared even on throw. The one place call sites
// hook into — no per-feature boolean.
async function withAiActivity<T>(kind: DodiActivity, fn: () => Promise<T>): Promise<T> {
  useDodiSessionStore.getState().beginAiActivity(kind);
  try {
    return await fn();
  } finally {
    useDodiSessionStore.getState().endAiActivity(kind);
  }
}

// ---------------------------------------------------------------------------
// External refs (outside Zustand to avoid serialization)
// ---------------------------------------------------------------------------

let client: VoiceClient | null = null;
let streamer: AudioStreamer | null = null;
let recorder: AudioRecorder | null = null;
let abortController: AbortController | null = null;

// Pooled-strategy refs (xAI): warm never-audio standby sockets. While deaf
// there is NO active client at all — deafening retires (closes) the tainted
// socket, activation acquires a warm one. See lib/ai/voice-socket-pool.ts.
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
// appends — queued behind an in-flight run, never dropped (the in-flight run
// may have listed the open days before the manual flush landed).
let memoryUpdateChain: Promise<void> = Promise.resolve();
let autoMemoryRunQueued = false;
let greetingSent = false;
let hasGreetedThisPageLoad = false;
let sessionIsBirthday = false;
let micRequestInFlight = false;
let tapStartedAtMs: number | null = null;
// Persisted deaf target for this connect: when the kid's `deafened_dodi_at` is
// set, Dodi comes up deaf directly (no audio resume, no greeting) instead of
// active — so the target state is known from the first moment of the connect.
let sessionStartDeaf = false;

// Game voice state refs
let turnBuffer = "";
let gameAssistanceTurns = 0;

// The provider/model of the current voice session, set whenever a config is
// built (connect / setContext). Drives usage attribution.
let sessionProvider: AIProviderId | null = null;
let sessionModel: string | null = null;

// Voice active-minute metering. Live voice APIs expose no reliable token usage,
// so we meter wall-clock time in the "active" state (mic on + audio playing).
// The kid/game/provider is captured at START so attribution survives even when
// `currentKidId` is nulled before cleanup() (sleep / endSession do that). One
// `voice_minutes` event per active↔inactive cycle; stop is idempotent so
// overlapping hooks are safe.
let voiceActiveSince: number | null = null;
let voiceMeterKidId: string | null = null;
let voiceMeterGameId: string | null = null;
let voiceMeterProvider: AIProviderId | null = null;
let voiceMeterModel: string | null = null;

function voiceMeterStart(): void {
  if (voiceActiveSince !== null || !currentKidId) return;
  voiceActiveSince = Date.now();
  voiceMeterKidId = currentKidId;
  voiceMeterProvider = sessionProvider;
  voiceMeterModel = sessionModel;
  const ctx = useDodiSessionStore.getState().context;
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
// Deferred client tool call (generate_drawing, save_snapshot, share_snapshot):
// hold the tool response until the app-side work lands so the voice model stays
// silent (a pending function call yields no audio) instead of looping filler.
// Resolved by resolveClientCommand() from the play view; timed out as a safety
// net so dropped/failed work can never freeze the turn open forever. At most
// one call is pending at a time — a newer call supersedes the old one.
let pendingClientCall: { id: string; name: string } | null = null;
let clientCallTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

// Deferred BRIDGE tool calls (submit_answer, next_task, …): the response is
// held until the first game-state event after the command lands, so the model
// observes the command's outcome (was the answer correct?) in the tool
// response itself — game state is never pushed unprompted. FIFO because games
// emit one state event per executed command; a per-entry timeout answers a
// plain ok as a safety net for games that emit nothing.
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

// ---------------------------------------------------------------------------
// Inactivity timer
// ---------------------------------------------------------------------------

let inactivityTimer: ReturnType<typeof setTimeout> | null = null;

function clearInactivityTimer(): void {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
}

function handleInteraction(): void {
  resetInactivityTimer();
}

function startInteractionListeners(): void {
  document.addEventListener("click", handleInteraction, { capture: true });
  document.addEventListener("touchstart", handleInteraction, { capture: true });
  document.addEventListener("keydown", handleInteraction, { capture: true });
}

function stopInteractionListeners(): void {
  document.removeEventListener("click", handleInteraction, { capture: true });
  document.removeEventListener("touchstart", handleInteraction, { capture: true });
  document.removeEventListener("keydown", handleInteraction, { capture: true });
}

function sleepFromInactivity(): void {
  // Lazy import to avoid circular ref at module init
  const store = useDodiSessionStore;
  const state = store.getState();
  if (state.state !== "active" && state.state !== "deaf") return;

  // Flush the in-progress round and push the outbox to the DB; memory
  // processing happens on the next connect.
  flushRound();
  if (currentKidId) void flushNow(currentKidId);

  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("pagehide", handlePageHide);
  stopInteractionListeners();

  currentKidId = null;
  sessionStartedAt = null;

  cleanup();
  resetFlowFlags();

  store.setState({
    state: "sleep",
    dodiSpeaking: false,
    gestureNeeded: false,
    error: null,
    chatMessages: [],
    chatSubmitting: false,
  });
}

function resetInactivityTimer(): void {
  clearInactivityTimer();
  inactivityTimer = setTimeout(sleepFromInactivity, INACTIVITY_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// Transcript rounds (persistence lives in @/lib/ai/transcript-sync)
// ---------------------------------------------------------------------------

/** Finalize the buffered speaker-run into one recorded transcript round. */
function flushRound(): void {
  const text = roundText.trim();
  if (roundRole && text) {
    recordRound({
      role: roundRole,
      text,
      occurredAt: roundStartedAt ?? new Date().toISOString(),
    });
    // Feed the recap replayed onto fresh sockets (pooled swaps, sleep→wake).
    recordRecapRound(roundRole, text);
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
function flushAndProcessMemory(
  kidId: string,
  opts: { includeToday?: boolean } = {},
): void {
  void (async () => {
    if (opts.includeToday) {
      await flushNow(kidId);
    } else {
      await syncAndSeed(kidId);
      // Coalesce overlapping auto runs (e.g. rapid reconnects) — one pass over
      // the open days is enough.
      if (autoMemoryRunQueued) return;
      autoMemoryRunQueued = true;
    }
    memoryUpdateChain = memoryUpdateChain.then(async () => {
      try {
        await runClientMemoryUpdate(kidId, opts);
      } finally {
        if (!opts.includeToday) autoMemoryRunQueued = false;
      }
    });
  })();
}

// ---------------------------------------------------------------------------
// Page lifecycle handlers
// ---------------------------------------------------------------------------

// On unload we flush the in-progress round into the outbox (synchronous
// localStorage write = crash persistence); the next connect POSTs it. Under
// E2EE only ciphertext ever reaches the server.
function handleBeforeUnload(): void {
  voiceMeterStop(true);
  flushRound();
}

function handlePageHide(): void {
  voiceMeterStop(true);
  flushRound();
}

// ---------------------------------------------------------------------------
// Resource cleanup
// ---------------------------------------------------------------------------

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
  sessionStartDeaf = false;
}

/**
 * Persist the deliberate deaf toggle to the kid row so it survives reconnects.
 * NULL ⇒ Dodi listens normally; a timestamp ⇒ the kid muted her. Best-effort:
 * the local cache is patched first so the UI (and the next connect's target)
 * stay consistent even if the PATCH is lost. No-ops when the persisted value
 * already matches, so the any-click "wake" path doesn't spam redundant writes.
 */
function persistDeafenedState(deafened: boolean): void {
  const kidId = currentKidId;
  if (!kidId) return;

  const store = useKidStore.getState();
  const currentValue = store.byId?.[kidId]?.deafened_dodi_at ?? null;
  if ((currentValue != null) === deafened) return;

  const value = deafened ? new Date().toISOString() : null;
  store.patchLocal?.(kidId, { deafened_dodi_at: value });

  void dodi
    .request(`/api/kids/${kidId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deafened_dodi_at: value }),
    })
    .catch(() => {
      // Best-effort: the local patch keeps the UI coherent and the next connect
      // re-reads the row, so a dropped write self-heals rather than hard-fails.
    });
}

function getGreetingMode(kidId: string, isBirthday: boolean): "long" | "short" | "birthday" {
  if (isBirthday) {
    const birthdayKey = `dodi-birthday-greeting-${kidId}`;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(birthdayKey) !== today) {
        localStorage.setItem(birthdayKey, today);
        return "birthday";
      }
    } catch { /* fall through */ }
  }

  const key = `dodi-last-long-greeting-${kidId}`;
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (localStorage.getItem(key) === today) return "short";
    localStorage.setItem(key, today);
    return "long";
  } catch {
    return "long";
  }
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Transition helpers
// ---------------------------------------------------------------------------

function transitionToActive(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
): void {
  if (!client || !currentKidId) return;

  set({ state: "active", gestureNeeded: false, error: null });
  voiceMeterStart();

  // A fresh socket knows nothing beyond its system instruction — replay a
  // compact recap of this page-load's conversation so Dodi keeps continuity
  // across socket swaps (pooled deaf cycles) and sleep→wake reconnects.
  if (!socketHasHistory) {
    socketHasHistory = true;
    const recap = buildRecapContext();
    if (recap) client.sendContext(recap);
  }

  if (!greetingSent) {
    greetingSent = true;
    if (!sessionStartedAt) {
      sessionStartedAt = new Date().toISOString();
      window.addEventListener("beforeunload", handleBeforeUnload);
      window.addEventListener("pagehide", handlePageHide);
    }

    if (!hasGreetedThisPageLoad) {
      hasGreetedThisPageLoad = true;
      const mode = getGreetingMode(currentKidId!, sessionIsBirthday);
      client.sendGreeting(mode);
    }
  }

  // No game-state catch-up: state is never pushed to the model — it reads the
  // host-buffered current state on demand via read_game_state.

  resetInactivityTimer();
  startInteractionListeners();

  // Start mic
  void startMic(set, get);
}

function transitionToDeaf(
  set: (partial: Partial<DodiSessionState>) => void,
  manual: boolean,
): void {
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
 * incidental page click can't wake her); otherwise try to resume the
 * AudioContext without a gesture — success means active, failure means deaf
 * with gestureNeeded (any click then wakes her). Persistent sockets run this
 * from their `setupComplete` event; pooled sessions after `pool.whenReady()`.
 */
function decideInitialPresence(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
  kidId: string,
  generation: number,
): void {
  if (sessionStartDeaf) {
    transitionToDeaf(set, true);
    return;
  }
  if (!streamer) {
    transitionToDeaf(set, false);
    return;
  }
  void streamer.tryResume().then((audioOk) => {
    // Guard against stale callback
    if (generation !== contextGeneration) return;
    if (currentKidId !== kidId) return;

    if (!audioOk) {
      transitionToDeaf(set, false);
      return;
    }
    if (sessionStrategy === "pooled") {
      void (async () => {
        const acquired = await acquireActiveClient(set, get);
        if (acquired) transitionToActive(set, get);
      })();
    } else {
      transitionToActive(set, get);
    }
  });
}

/**
 * Pooled strategy: take a warm socket from the pool and make it the session's
 * `client`. Usually instant (a standby is already setup-complete); when none
 * is ready yet (rapid toggling), the state dips to "connecting" until the
 * standby finishes its handshake. Returns false when superseded/destroyed
 * (silent) — pool-fatal failures surface through the pool's onFatal.
 */
async function acquireActiveClient(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
): Promise<boolean> {
  const thisPool = pool;
  const kidId = currentKidId;
  if (!thisPool || !kidId) return false;
  const gen = contextGeneration;
  const isGameContext = get().context.type === "game";

  if (!thisPool.headReady) set({ state: "connecting" });
  try {
    const acquired = await thisPool.acquire(
      createEventHandler(set, get, kidId, gen, isGameContext),
    );
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
function handlePoolFatal(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
  message: string,
): void {
  if (get().state === "active" && client) {
    console.warn("[VoicePool] fatal while a conversation is running:", message);
    return;
  }
  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("pagehide", handlePageHide);
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

/**
 * Pooled strategy: an ACTIVE socket died unexpectedly (network blip, server
 * kill). Instead of tearing the session down, retire it and promote a warm
 * standby — the conversation resumes in about a second (with recap). Rate
 * limited; systematic failures fall through to the normal teardown, where the
 * game pages' auto-reconnect remains the backstop. Returns whether recovery
 * was started.
 */
function tryFastRecovery(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
): boolean {
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
    const acquired = await acquireActiveClient(set, get);
    if (acquired) transitionToActive(set, get);
  })();
  return true;
}

async function startMic(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
): Promise<void> {
  if (get().state !== "active") return;
  if (micRequestInFlight) return;
  if (!currentKidId) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    set({ error: "secureContextRequired" });
    return;
  }

  micRequestInFlight = true;

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    if (get().state !== "active") {
      for (const track of micStream.getTracks()) track.stop();
      return;
    }

    recorder?.stop();
    const rec = new AudioRecorder((base64Pcm: string) => {
      client?.sendAudio(base64Pcm);
    });
    recorder = rec;
    await rec.startWithStream(micStream);
    set({ error: null });
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotAllowedError") {
      set({ error: "micPermissionNeeded" });
    } else {
      const message = err instanceof Error ? err.message : "Microphone unavailable";
      set({ error: message });
    }
  } finally {
    micRequestInFlight = false;
  }
}

// ---------------------------------------------------------------------------
// Context comparison
// ---------------------------------------------------------------------------

function contextRequiresReconnect(a: DodiContext, b: DodiContext): boolean {
  // home <-> browse: no reconnect needed
  if (
    (a.type === "home" && b.type === "browse") ||
    (a.type === "browse" && b.type === "home")
  ) {
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
// Store
// ---------------------------------------------------------------------------

export const useDodiSessionStore = create<DodiSessionState>((set, get) => ({
  displayMode: "full",
  context: { type: "home" },

  kidId: null,
  state: "disconnected",
  dodiSpeaking: false,
  gestureNeeded: false,
  error: null,
  fatalError: false,

  chatMessages: [],
  chatSubmitting: false,

  onRunCommands: null,
  onRequestSnapshot: null,
  aiActivity: { image: 0, thinking: 0, writing: 0 },

  gameAssistanceCount: 0,
  resetGameAssistance: () => {
    gameAssistanceTurns = 0;
    set({ gameAssistanceCount: 0 });
  },

  pendingNavigation: null,
  clearPendingNavigation: () => {
    set({ pendingNavigation: null });
  },

  setDisplayMode: (mode: DodiDisplayMode) => {
    set({ displayMode: mode });
  },

  setOnRunCommands: (handler) => {
    set({ onRunCommands: handler });
  },

  setOnRequestSnapshot: (handler) => {
    set({ onRequestSnapshot: handler });
  },

  beginAiActivity: (kind) => {
    set((s) => ({ aiActivity: { ...s.aiActivity, [kind]: s.aiActivity[kind] + 1 } }));
  },

  endAiActivity: (kind) => {
    set((s) => ({
      aiActivity: { ...s.aiActivity, [kind]: Math.max(0, s.aiActivity[kind] - 1) },
    }));
  },

  resolveClientCommand: (result) => {
    // Called by the play view when the app-side work behind a client tool call
    // (drawing generated, snapshot saved/shared) has landed or failed. Answers
    // the held-open call so Dodi finally speaks one completion line. No-ops for
    // marker-triggered commands that never opened a tool call, and for a call
    // already resolved by the safety timeout.
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

  setContext: async (newContext: DodiContext, kidId: string) => {
    const state = get();
    const oldContext = state.context;

    // If same context and same kid, just update gameState if needed
    if (!contextRequiresReconnect(oldContext, newContext)) {
      set({ context: newContext });
      return;
    }

    // Don't reconnect when sleeping — kid must tap Dodi to wake
    if (state.state === "sleep") {
      set({ context: newContext });
      return;
    }

    // Offline: record the context but skip the doomed reconnect. Deliberately
    // NOT fatal — the auto-connect effects retry when connectivity returns.
    if (!isCurrentlyOnline()) {
      set({ context: newContext, state: "disconnected", error: null });
      return;
    }

    // Context requires reconnect (e.g., home/browse <-> game, or game <-> different game)
    const gen = ++contextGeneration;

    // Stop audio but don't fire memory update — transcript persists
    recorder?.stop();
    recorder = null;
    if (client) {
      // Pooled: retire through the pool so the close stays internal and a
      // replacement standby is warmed.
      if (sessionStrategy === "pooled" && pool) {
        pool.retire(client);
      } else {
        client.disconnect();
      }
      client = null;
    }
    clearPendingBridgeCalls();
    turnBuffer = "";

    // Clear game-specific chat messages when entering a new game or leaving game
    set({
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
      let config: GameVoiceSessionConfig;

      if (newContext.type === "game") {
        // Build the voice session client-side from the vault (E2EE): the server
        // can no longer decrypt the provider key. Mirrors connect().
        config = await buildGameVoiceConfig(kidId, newContext);
        if (gen !== contextGeneration || controller.signal.aborted) return;
      } else {
        // Home/browse context — build client-side from the vault (E2EE).
        config = await buildHomeVoiceConfig(kidId);
        if (gen !== contextGeneration || controller.signal.aborted) return;
      }

      if (gen !== contextGeneration || controller.signal.aborted) return;

      sessionIsBirthday = config.isBirthday ?? false;
      sessionProvider = config.provider;
      sessionModel = config.model;
      const newStrategy = voiceSocketStrategy(config.provider);

      if (!streamer) {
        streamer = new AudioStreamer();
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
          const newPool: VoiceSocketPool = new VoiceSocketPool({
            config,
            onFatal: (message) => {
              if (pool !== newPool) return;
              handlePoolFatal(set, get, message);
            },
          });
          pool = newPool;
          newPool.start();
          await newPool.whenReady();
        }
        if (gen !== contextGeneration || controller.signal.aborted) return;
        // Parity with the persistent path, which logs this from setupComplete
        // on every reconnect.
        logKidActivity({
          kidId,
          event: "session_start",
          message: "Voice session started",
        });
        decideInitialPresence(set, get, kidId, gen);
      } else {
        pool?.destroy();
        pool = null;
        sessionStrategy = newStrategy;
        const isGameContext = newContext.type === "game";
        const handleEvent = createEventHandler(set, get, kidId, gen, isGameContext);
        client = createVoiceClient(config, handleEvent);
        socketHasHistory = false;
        client.connect();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Pool aborts (superseded/destroyed) are benign races; pool-fatal
      // failures already surfaced through the pool's onFatal.
      if (err instanceof VoiceSocketPoolError) return;
      if (gen !== contextGeneration) return;
      const message = err instanceof Error ? err.message : "Failed to switch context";
      // Same as connect(): a failed config build won't recover on auto-retry, so
      // mark it fatal to stop the disconnected→reconnect hot-loop.
      set({ state: "disconnected", error: message, fatalError: true });
    }
  },

  connect: async (kidId: string) => {
    if (!kidId) return;

    // Offline: stay disconnected quietly (dodi sleeps). Deliberately NOT
    // fatal — the auto-connect effects retry when connectivity returns.
    if (!isCurrentlyOnline()) {
      set({ kidId, state: "disconnected", error: null, fatalError: false });
      return;
    }

    const currentState = get();

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
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      cleanup();
      resetFlowFlags();
      resetRecap();
    }

    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("pagehide", handlePageHide);
    cleanup();

    // DB-first transcripts: start today's day model, seed it from the stored
    // mirror + flush any outbox backlog, then process unprocessed past days
    // into memory. Sequential inside flushAndProcessMemory so the memory
    // update sees the freshly flushed rows.
    beginDay(kidId);
    flushAndProcessMemory(kidId);
    roundRole = null;
    roundText = "";
    roundStartedAt = null;

    currentKidId = kidId;
    sessionStartedAt = null;
    greetingSent = false;
    micRequestInFlight = false;

    const gen = ++contextGeneration;
    const controller = new AbortController();
    abortController = controller;

    set({
      kidId,
      state: "connecting",
      dodiSpeaking: false,
      gestureNeeded: false,
      error: null,
      fatalError: false,
    });

    try {
      // Resolve the persisted deaf target up front so it's known from the very
      // first moment of the connect: a set `deafened_dodi_at` means the kid
      // muted Dodi last time, so we come up deaf directly rather than active.
      try {
        const kid = await useKidStore.getState().loadOne(kidId);
        if (gen !== contextGeneration || controller.signal.aborted) return;
        sessionStartDeaf = kid?.deafened_dodi_at != null;
      } catch {
        sessionStartDeaf = false;
      }

      const currentContext = get().context;
      let config: GameVoiceSessionConfig;

      if (currentContext.type === "game") {
        config = await buildGameVoiceConfig(kidId, currentContext);
        if (gen !== contextGeneration || controller.signal.aborted) return;
      } else {
        config = await buildHomeVoiceConfig(kidId);
        if (gen !== contextGeneration || controller.signal.aborted) return;
      }

      if (gen !== contextGeneration || controller.signal.aborted) return;

      sessionIsBirthday = config.isBirthday ?? false;
      sessionProvider = config.provider;
      sessionModel = config.model;
      sessionStrategy = voiceSocketStrategy(config.provider);

      streamer = new AudioStreamer();

      if (sessionStrategy === "pooled") {
        lastFastRecoveryAt = 0;
        const newPool: VoiceSocketPool = new VoiceSocketPool({
          config,
          onFatal: (message) => {
            if (pool !== newPool) return;
            handlePoolFatal(set, get, message);
          },
        });
        pool = newPool;
        newPool.start();
        await newPool.whenReady();
        if (gen !== contextGeneration || controller.signal.aborted) return;
        // Insights: voice session connected (dashboard counts session_start).
        // Persistent sockets log this from their setupComplete event.
        logKidActivity({
          kidId,
          event: "session_start",
          message: "Voice session started",
        });
        decideInitialPresence(set, get, kidId, gen);
      } else {
        const isGameContext = currentContext.type === "game";
        const handleEvent = createEventHandler(set, get, kidId, gen, isGameContext);
        client = createVoiceClient(config, handleEvent);
        socketHasHistory = false;
        client.connect();
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Pool aborts (superseded/destroyed) are benign races; pool-fatal
      // failures already surfaced through the pool's onFatal.
      if (err instanceof VoiceSocketPoolError) return;
      if (gen !== contextGeneration) return;
      const message = err instanceof Error ? err.message : "Failed to connect";
      tapStartedAtMs = null;
      set({
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

  activate: async () => {
    const current = get();
    if (current.state !== "deaf") return;
    if (!currentKidId) return;
    if (sessionStrategy === "persistent" && !client) return;

    // Prime AudioContext from user gesture — must stay synchronous inside the
    // gesture (autoplay unlock), before any await below.
    if (!streamer) {
      streamer = new AudioStreamer();
    }
    streamer.primeFromGesture();
    tapStartedAtMs = performance.now();

    if (sessionStrategy === "pooled") {
      // A pool that failed fatally while the last conversation was running
      // surfaces here, on the next deliberate wake.
      if (!pool || pool.hasFatalError) {
        handlePoolFatal(
          set,
          get,
          pool?.fatalErrorMessage ??
            "dodi couldn't reach the voice provider. Please try again.",
        );
        return;
      }
      const acquired = await acquireActiveClient(set, get);
      if (!acquired) return;
    }

    transitionToActive(set, get);
    // The kid deliberately woke Dodi → clear the persisted deaf state so the
    // next connect comes up listening. (No-ops if it wasn't set.)
    sessionStartDeaf = false;
    persistDeafenedState(false);
  },

  deactivate: () => {
    const current = get();
    if (current.state !== "active") return;

    transitionToDeaf(set, true);
    // The kid deliberately muted Dodi → persist it so she stays deaf across
    // reconnects until re-enabled.
    sessionStartDeaf = true;
    persistDeafenedState(true);
  },

  toggleActive: () => {
    const current = get();
    if (current.state === "active") {
      get().deactivate();
    } else if (current.state === "deaf") {
      void get().activate();
    } else if ((current.state === "disconnected" || current.state === "sleep") && current.kidId) {
      void get().connect(current.kidId);
    }
    // connecting: no-op
  },

  endSession: () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("pagehide", handlePageHide);

    // Flush the in-progress round and push the outbox to the DB; memory
    // processing stays a connect-time concern.
    flushRound();
    if (currentKidId) void flushNow(currentKidId);

    currentKidId = null;
    sessionStartedAt = null;
    hasGreetedThisPageLoad = false;
    resetRecap();

    cleanup();
    resetFlowFlags();

    set({
      kidId: null,
      state: "disconnected",
      dodiSpeaking: false,
      gestureNeeded: false,
      error: null,
      chatMessages: [],
      chatSubmitting: false,
      pendingNavigation: null,
    });
  },

  processMemoryNow: (kidId: string) => {
    if (!kidId) return;

    // Flush the in-progress round, push the outbox to the DB, then process
    // everything including today's still-open transcript.
    if (currentKidId === kidId) flushRound();
    flushAndProcessMemory(kidId, { includeToday: true });
  },

  sendTextMessage: async (message: string, gameId?: string) => {
    const trimmed = message.trim();
    if (!trimmed || !currentKidId) return;

    const state = get();
    if (state.chatSubmitting) return;

    // A text turn during game play also counts as "asking Dodi".
    if (gameId) {
      gameAssistanceTurns += 1;
      set({ gameAssistanceCount: gameAssistanceTurns });
    }

    // Add kid message
    const kidMsg: CompanionMessage = { id: createMessageId(), role: "kid", text: trimmed };
    set({
      chatMessages: [...state.chatMessages, kidMsg].slice(-MAX_MESSAGES),
      chatSubmitting: true,
    });

    const gameContext = state.context.type === "game" ? state.context : null;
    if (!gameContext) {
      set({ chatSubmitting: false });
      return;
    }

    try {
      // Runs fully in the browser: the child's data + persona soul are E2EE and
      // the thinking key lives only in the unlocked vault, so the server can
      // neither assemble the prompt nor run this. Mirrors the voice companion.
      const data = await runGameTextAssistant(currentKidId, gameContext, trimmed);

      gameDebug("text", "Assistant response:", {
        reply: data.reply?.slice(0, 100),
        commandCount: data.commands?.length ?? 0,
      });

      const newMessages = [...get().chatMessages];
      if (data.reply) {
        newMessages.push({ id: createMessageId(), role: "dodi", text: data.reply });
      }
      set({ chatMessages: newMessages.slice(-MAX_MESSAGES), chatSubmitting: false });

      // Route commands to sandbox
      const { onRunCommands } = get();
      if (data.commands?.length && onRunCommands) {
        onRunCommands(data.commands);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Assistant failed";
      const newMessages = [...get().chatMessages];
      newMessages.push({ id: createMessageId(), role: "dodi", text: `Error: ${errorMsg}` });
      set({ chatMessages: newMessages.slice(-MAX_MESSAGES), chatSubmitting: false });
    }
  },

  updateGameState: (state: Record<string, unknown>) => {
    const current = get();
    if (current.context.type !== "game") return;

    // The host buffers the current game state; the voice model is never pushed
    // to — it fetches on demand via read_game_state / analyze_game_state.
    set({
      context: { ...current.context, gameState: state },
    });

    // A bridge tool call is waiting for its outcome: the first state event
    // after the command is its observation — answer with the updated state.
    const pending = pendingBridgeCalls.shift();
    if (pending) {
      clearTimeout(pending.timer);
      gameDebug("voice", `Resolving deferred ${pending.name} with post-command state`);
      client?.sendToolResponse(pending.id, pending.name, { ok: true, state });
    }
  },
}));

// ---------------------------------------------------------------------------
// Event handler factory
// ---------------------------------------------------------------------------

function createEventHandler(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
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
        logKidActivity({
          kidId,
          event: "session_start",
          message: "Voice session started",
        });
        decideInitialPresence(set, get, kidId, generation);
        break;
      }

      case "audio":
        if (!greetingSent) return;
        if (get().state !== "active") return;
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
          const elapsed = Math.round(performance.now() - tapStartedAtMs);
          tapStartedAtMs = null;
          console.info("tap_to_first_audio_ms", elapsed);
        }
        set({ dodiSpeaking: true });
        streamer?.addPcmChunk(event.data);
        break;

      case "text":
        if (!greetingSent) return;
        // `text` is native-audio model metadata, not a clean transcript —
        // Dodi's spoken words arrive via `outputTranscription`. Use it only to
        // feed the game command-marker buffer.
        if (isGameContext) {
          turnBuffer += event.text;
        }
        break;

      case "inputTranscription":
        if (!greetingSent) return;
        resetInactivityTimer();
        // A new kid run (role switch) counts as one "asking Dodi" turn while a
        // game is open — counted per round, not per streamed fragment.
        if (isGameContext && roundRole !== "kid") {
          gameAssistanceTurns += 1;
          set({ gameAssistanceCount: gameAssistanceTurns });
        }
        appendRoundFragment("kid", event.text);
        break;

      case "outputTranscription":
        if (!greetingSent) return;
        appendRoundFragment("dodi", event.text);
        break;

      case "toolCall":
        gameDebug("voice", `Tool call: ${event.name}(${JSON.stringify(event.args)})`);

        if (event.name === "launch_game") {
          // Navigate to a game or filtered game library
          const gameId = typeof event.args.game_id === "string" ? event.args.game_id : "";
          const searchQuery = typeof event.args.search_query === "string" ? event.args.search_query : "";
          const tag = typeof event.args.tag === "string" ? event.args.tag : "";

          let navPath: string;
          let action: string;

          if (gameId) {
            navPath = `/games/${gameId}`;
            action = "navigating_to_game";
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
        } else if (
          isGameContext &&
          (STANDARD_TOOLS_BY_NAME[event.name]?.kind === "bridge" ||
            STANDARD_TOOLS_BY_NAME[event.name]?.kind === "client")
        ) {
          // First-class standardized game command → forward to the sandbox as a
          // {type, payload} bridge command (game-play-view intercepts the
          // client-kind generate_drawing before it reaches the sandbox).
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
            // Client-intercepted (generate_drawing, save_snapshot,
            // share_snapshot): the app-side work takes a few seconds. HOLD the
            // tool response open until it lands — while a function call is
            // pending the native-audio model produces no audio, so Dodi stays
            // silent instead of looping filler. The play view calls
            // resolveClientCommand() when it resolves/fails.
            clearClientCallTimeout();
            pendingClientCall = { id: event.id, name: event.name };
            gameDebug(
              "voice",
              `${event.name} → DEFERRING response; playback backlog=${streamer?.backlogSeconds().toFixed(1)}s`,
            );
            // Flush the playback backlog so the pending window is actually
            // silent; the deferred response then drives one clean completion line.
            streamer?.stop();
            set({ dodiSpeaking: false });
            clientCallTimeoutTimer = setTimeout(() => {
              if (!pendingClientCall) return;
              gameDebugWarn("voice", `${pendingClientCall.name} timed out — sending fallback response`);
              client?.sendToolResponse(pendingClientCall.id, pendingClientCall.name, {
                ok: false,
                error:
                  "It took too long and timed out. In one short sentence, gently tell the child it didn't work this time.",
              });
              pendingClientCall = null;
              clientCallTimeoutTimer = null;
            }, CLIENT_CALL_TIMEOUT_MS[event.name] ?? CLIENT_CALL_TIMEOUT_FALLBACK_MS);
          } else {
            // Bridge command → DEFER the response until the game's next state
            // event, so the model observes the command's outcome (was the
            // answer correct?) in the tool response itself. Resolved FIFO in
            // updateGameState; the timeout is the safety net for games that
            // emit no state event.
            const callId = event.id;
            const callName = event.name;
            const timer = setTimeout(() => {
              const idx = pendingBridgeCalls.findIndex((c) => c.id === callId);
              if (idx === -1) return;
              pendingBridgeCalls.splice(idx, 1);
              gameDebugWarn(
                "voice",
                `${callName} produced no state event — sending plain ok`,
              );
              client?.sendToolResponse(callId, callName, {
                ok: true,
                command: callName,
              });
            }, BRIDGE_CALL_TIMEOUT_MS);
            pendingBridgeCalls.push({ id: callId, name: callName, timer });
          }
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
          // Offload complex state analysis to the thinking model
          const question = typeof event.args.question === "string" ? event.args.question : "What is the current game state?";

          gameDebug("voice", `analyze_game_state: "${question}"`);

          const ctx = get().context;
          if (ctx.type !== "game") {
            client?.sendToolResponse(event.id, event.name, {
              ok: false,
              error: "Not in a game context",
            });
            return;
          }

          // The whole analysis runs IN THE BROWSER: the provider key is E2EE
          // (only the vault can decrypt it), so we resolve the thinking
          // provider/model/key here and call the provider directly — nothing
          // touches our servers. Also grab a fresh canvas snapshot when the game
          // supports get_snapshot (gated to avoid the 3s requestSnapshot timeout
          // for games with no visual surface).
          void (async () => {
            try {
              const thinking = await resolveClientThinking();
              if (!thinking) {
                client?.sendToolResponse(event.id, event.name, {
                  ok: false,
                  error:
                    "No thinking model is configured, so I can't look closely right now. " +
                    "Answer briefly from what you already know about the game state.",
                });
                return;
              }

              // Show the companion's "thinking" state for the whole analysis
              // window (snapshot grab + provider call), cleared even on throw.
              const { analysis, usage } = await withAiActivity("thinking", async () => {
                const snapshotHandler = get().onRequestSnapshot;
                const snapshot =
                  snapshotHandler && ctx.capabilities.includes("get_snapshot")
                    ? await snapshotHandler().catch(() => null)
                    : null;
                if (snapshot) {
                  gameDebug("voice", `analyze_game_state: got snapshot (${snapshot.length} chars)`);
                }

                const kid = await useKidStore.getState().loadOne(kidId);
                return analyzeGameState({
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
        } else {
          gameDebugWarn("voice", `Unknown or unavailable tool: ${event.name}`);
          client?.sendToolResponse(event.id, event.name, {
            ok: false,
            error: `Tool not available in current context`,
          });
        }
        break;

      case "turnComplete": {
        turnNumber++;
        gameDebug("voice", `[T${turnNumber}] Complete: audio=${turnAudioChunks}, text="${turnBuffer.trim().slice(0, 200)}"`);

        // Reset per-turn counters
        turnAudioChunks = 0;

        if (!greetingSent) return;
        set({ dodiSpeaking: false });

        // End of the model's turn — finalize the current (Dodi) round as one entry.
        flushRound();

        if (isGameContext) {
          const text = turnBuffer.trim();
          turnBuffer = "";

          // Only extract command markers from voice text — never add raw text to chat
          // (voice text is model thinking/metadata, not user-facing content)
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

      case "interrupted":
        if (!greetingSent) return;
        set({ dodiSpeaking: false });
        streamer?.stop();
        break;

      case "error": {
        // Pooled + active: the retire inside recovery swallows the `closed`
        // that usually follows a socket error, so recovering here covers both
        // the error→closed sequence and error-only server hiccups.
        if (tryFastRecovery(set, get)) break;
        const wasConnected =
          get().state === "connecting" ||
          get().state === "active" ||
          get().state === "deaf";
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.removeEventListener("pagehide", handlePageHide);
        cleanup();
        resetFlowFlags();
        set({
          state: "disconnected",
          dodiSpeaking: false,
          gestureNeeded: false,
          error: wasConnected ? event.error : null,
        });
        break;
      }

      case "closed": {
        if (!event.fatal && tryFastRecovery(set, get)) break;
        const wasConnected =
          get().state === "connecting" ||
          get().state === "active" ||
          get().state === "deaf";
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.removeEventListener("pagehide", handlePageHide);
        cleanup();
        resetFlowFlags();
        set({
          state: "disconnected",
          dodiSpeaking: false,
          gestureNeeded: false,
          // Fatal closes (quota, auth) surface their message and block auto-reconnect.
          fatalError: event.fatal,
          error: event.fatal
            ? event.message
            : wasConnected
              ? event.message
              : null,
        });
        break;
      }
    }
  };
}
