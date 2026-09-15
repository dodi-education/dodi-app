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
import {
  readKidVolume,
  useCompanionVolumeStore,
} from "@/stores/companion-volume-store";
import { useKidStore } from "@/stores/kid-store";
import { analyzeGameState } from "@dodi/ai/game-analysis";
import { getLanguageDisplayName } from "@dodi/ai/dodi-context";
import { extractCommandMarkers } from "@dodi/games/command-markers";
import { gameDebug, gameDebugWarn } from "@dodi/games/debug";
import { STANDARD_TOOLS_BY_NAME } from "@dodi/games/toolbox";
import type { AIProviderId } from "@dodi/types/ai";
import type { Kid } from "@dodi/types/database";
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
  // Output mute — orthogonal to `state`. Composes with every state value
  // (muted+active, muted+deaf, …): while true dodi produces NO audio and game
  // read-alouds are refused, but her listening state is untouched. Persisted on
  // kids.muted_dodi_at, independent of the deaf toggle (kids.deafened_dodi_at).
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

  // Have Dodi read a short game-provided text aloud through the voice session
  // (game:event "request_generate_voice", intercepted by the play view).
  // Synchronous: ok=true means the read-aloud turn was submitted (or is being
  // submitted on a borrowed socket); ok=false with the stable "voice_unavailable"
  // code means she can't speak right now. Deaf still speaks (ears off, voice on);
  // only a full mute, sleep, or a dead session refuses — mute means mute.
  speakGameVoiceText: (
    text: string,
  ) => { ok: true } | { ok: false; error: "voice_unavailable" };

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
  /** Wake Dodi from deaf. `deliberate` false = an incidental page click, which
   *  never clears a persisted mute (see the any-click handler in KidChrome). */
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

// Game voice state refs
let turnBuffer = "";
let gameAssistanceTurns = 0;

// A game-requested read-aloud (speakGameVoiceText) is in flight. While deaf
// this is the ONLY thing allowed to produce audio, and it also bypasses the
// greetingSent gate (a session that came up deaf never greeted). On the pooled
// strategy the socket it borrows is retired when the turn completes.
let gameSpeechActive = false;
let gameSpeechTimeout: ReturnType<typeof setTimeout> | null = null;

// Framing for a game read-aloud: the text is untrusted game output, so it is
// quoted material to read, never instructions. The play view caps its length.
const READ_ALOUD_FRAME =
  "The game asks you to read a text out loud to the child right now. " +
  "Read it exactly as written, in the text's own language, warmly and " +
  "clearly, with no introduction, no commentary, nothing added before or " +
  "after:\n\n";

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

/** New AudioStreamer pre-set to the current kid's persisted output volume, so
 *  the first utterance already plays at the chosen loudness (no jump). */
function createStreamer(): AudioStreamer {
  const s = new AudioStreamer();
  s.setVolume(
    currentKidId
      ? readKidVolume(currentKidId)
      : useCompanionVolumeStore.getState().volume,
  );
  return s;
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

// ---------------------------------------------------------------------------
// Persisted companion-presence state
// (kids.deafened_dodi_at = hearing, kids.muted_dodi_at = output)
//
// Two independent, deliberate kid toggles. Each must never be lost or guessed
// at, so each is written through its own outbox (durable before the request is
// even attempted) and re-read from the kid row at every bring-up. The machinery
// is shared and keyed by field; the deafened localStorage key is unchanged so
// existing parked toggles survive this refactor.
// ---------------------------------------------------------------------------

type PresenceField = "deafened_dodi_at" | "muted_dodi_at";

const PRESENCE_OUTBOX_PREFIX: Record<PresenceField, string> = {
  deafened_dodi_at: "dodi-deafened-pending-",
  muted_dodi_at: "dodi-muted-pending-",
};

/** localStorage key holding a presence toggle the server has not confirmed. */
function presenceOutboxKey(kidId: string, field: PresenceField): string {
  return `${PRESENCE_OUTBOX_PREFIX[field]}${kidId}`;
}

// Fallback for browsers where localStorage throws (private mode, at quota).
// Keyed by `${field}:${kidId}`. Only populated when the durable write failed,
// so localStorage stays the single source of truth on the normal path.
const presenceOutboxFallback = new Map<string, string | null>();

function presenceFallbackKey(kidId: string, field: PresenceField): string {
  return `${field}:${kidId}`;
}

/** The unconfirmed toggle for this kid+field, or null when the row is in sync. */
function readPresenceOutbox(
  kidId: string,
  field: PresenceField,
): { value: string | null } | null {
  try {
    const raw = localStorage.getItem(presenceOutboxKey(kidId, field));
    if (raw !== null) {
      const value: unknown = JSON.parse(raw);
      return { value: typeof value === "string" ? value : null };
    }
  } catch {
    // Unreadable — fall through to the in-memory fallback.
  }
  const fk = presenceFallbackKey(kidId, field);
  if (presenceOutboxFallback.has(fk)) {
    return { value: presenceOutboxFallback.get(fk) ?? null };
  }
  return null;
}

function writePresenceOutbox(
  kidId: string,
  field: PresenceField,
  value: string | null,
): void {
  const fk = presenceFallbackKey(kidId, field);
  try {
    localStorage.setItem(presenceOutboxKey(kidId, field), JSON.stringify(value));
    presenceOutboxFallback.delete(fk);
  } catch {
    presenceOutboxFallback.set(fk, value);
  }
}

/**
 * Send the kid's parked toggle, clearing the outbox only once it actually
 * lands. Toggling is typically the last thing a kid does before navigating or
 * closing the tab, so the request is `keepalive` — without it the browser
 * cancels it on unload and the toggle silently reverts on the next load.
 */
async function flushPresenceOutbox(
  kidId: string,
  field: PresenceField,
): Promise<void> {
  const parked = readPresenceOutbox(kidId, field);
  if (!parked) return;

  try {
    const res = await dodi.request(`/api/kids/${kidId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: parked.value }),
      keepalive: true,
    });
    // `dodi.request` resolves for 4xx/5xx too — an unchecked response would
    // drop a toggle the server never stored.
    if (!res.ok) return;
  } catch {
    return; // offline / aborted — retried on the next bring-up
  }

  // Only drop it if the kid hasn't toggled again while this was in flight.
  const still = readPresenceOutbox(kidId, field);
  if (!still || still.value !== parked.value) return;
  presenceOutboxFallback.delete(presenceFallbackKey(kidId, field));
  try {
    localStorage.removeItem(presenceOutboxKey(kidId, field));
  } catch {
    // Nothing to do — a redundant re-send is harmless.
  }
}

/** Flush every parked presence toggle for this kid (endSession / unload). */
function flushAllPresenceOutboxes(kidId: string): void {
  void flushPresenceOutbox(kidId, "deafened_dodi_at");
  void flushPresenceOutbox(kidId, "muted_dodi_at");
}

/**
 * The kid's toggle as the client currently knows it. A parked toggle wins over
 * the cached row: it is the more recent intent.
 */
function isPresencePersisted(kidId: string, field: PresenceField): boolean {
  const parked = readPresenceOutbox(kidId, field);
  if (parked) return parked.value != null;
  const cached = useKidStore.getState().byId?.[kidId]?.[field] ?? null;
  return cached != null;
}

/**
 * Persist a deliberate presence toggle to the kid row so it survives reconnects
 * AND reloads. NULL ⇒ off; a timestamp ⇒ on. The local cache and the outbox are
 * both written synchronously, so the intent is durable before the PATCH is
 * attempted. No-ops when the value already matches. `kidId` defaults to the
 * connected session but can be passed explicitly (the volume control mutes even
 * with no session up).
 */
function persistPresenceField(
  field: PresenceField,
  on: boolean,
  kidId: string | null = currentKidId,
): void {
  if (!kidId) return;
  if (isPresencePersisted(kidId, field) === on) return;

  const value = on ? new Date().toISOString() : null;
  useKidStore.getState().patchLocal?.(kidId, { [field]: value } as Partial<Kid>);
  writePresenceOutbox(kidId, field, value);
  void flushPresenceOutbox(kidId, field);
}

/**
 * Resolve one presence field for a bring-up: a parked toggle wins (more recent
 * intent), then the cached row, then a fresh load. `fallbackWhenUnreachable` is
 * the answer when the row can't be read (offline, cold cache).
 */
async function resolvePresenceField(
  kidId: string,
  field: PresenceField,
  fallbackWhenUnreachable: boolean,
): Promise<boolean> {
  const parked = readPresenceOutbox(kidId, field);
  if (parked) {
    void flushPresenceOutbox(kidId, field);
    return parked.value != null;
  }

  const store = useKidStore.getState();
  const cached = store.byId?.[kidId];
  if (cached) return cached[field] != null;

  try {
    const kid = await store.loadOne(kidId);
    return kid?.[field] != null;
  } catch {
    return fallbackWhenUnreachable;
  }
}

/**
 * Resolve both presence targets for one bring-up. Every path that raises a
 * session (connect, setContext, a socket's setupComplete) runs this, so targets
 * are decided from the kid row at the moment of the decision — never from a flag
 * a superseded connect may never have reached.
 */
async function resolveStartPresence(
  kidId: string,
): Promise<{ startDeaf: boolean; startMuted: boolean }> {
  const [startDeaf, startMuted] = await Promise.all([
    // Unreachable row ⇒ come up deaf rather than guessing "listening": a failed
    // read must never unmute a kid who deafened dodi (a tap wakes her).
    resolvePresenceField(kidId, "deafened_dodi_at", true),
    // ...but do NOT guess muted: wrongly muting would silently break game audio
    // with no visible cause, so an unreadable row comes up unmuted.
    resolvePresenceField(kidId, "muted_dodi_at", false),
  ]);
  return { startDeaf, startMuted };
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
 *
 * The persisted target is resolved HERE rather than handed in by the caller:
 * `connect` and `setContext` both raise sessions, and a connect superseded by
 * a navigation returns early — a flag it set would then be missing or stale,
 * which is how a muted Dodi used to come back up listening.
 */
function decideInitialPresence(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
  kidId: string,
  generation: number,
): void {
  const isStale = (): boolean =>
    generation !== contextGeneration || currentKidId !== kidId;

  void (async () => {
    const { startDeaf, startMuted } = await resolveStartPresence(kidId);
    if (isStale()) return;

    // Output mute is orthogonal to presence: apply it, but let the deaf/active
    // decision key on `startDeaf` alone (a muted kid may still be listening).
    set({ muted: startMuted });

    if (startDeaf) {
      transitionToDeaf(set, true);
      return;
    }
    // Captured across the await: cleanup() may null the module ref, and a
    // retired streamer must not decide this session's presence.
    const activeStreamer = streamer;
    if (!activeStreamer) {
      transitionToDeaf(set, false);
      return;
    }

    const audioOk = await activeStreamer.tryResume();
    if (isStale() || streamer !== activeStreamer) return;

    if (!audioOk) {
      transitionToDeaf(set, false);
      return;
    }
    if (sessionStrategy === "pooled") {
      const acquired = await acquireActiveClient(set, get);
      if (acquired) transitionToActive(set, get);
    } else {
      transitionToActive(set, get);
    }
  })();
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

// ---------------------------------------------------------------------------
// Game read-aloud while deaf (speakGameVoiceText)
// ---------------------------------------------------------------------------

const GAME_SPEECH_MAX_MS = 45_000;

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
    finishGameSpeech(
      (partial) => useDodiSessionStore.setState(partial),
      () => useDodiSessionStore.getState(),
    );
  }, GAME_SPEECH_MAX_MS);
}

/**
 * End an in-flight read-aloud. Pooled sockets are billed once tainted by the
 * audio they just produced, so the borrowed socket is retired the moment the
 * turn ends; persistent sockets simply stay open (normal deaf behavior). Only
 * touches the socket while still deaf — if the kid activated meanwhile, the
 * active path now owns `client`. Idempotent.
 */
function finishGameSpeech(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
): void {
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
    set({ dodiSpeaking: false });
  }
}

/**
 * Pooled (xAI) deaf read-aloud: there is no socket while deaf, so borrow a warm
 * one for this single turn, speak, and let `finishGameSpeech` retire it. Every
 * await is guarded against the kid activating, muting, switching, or navigating
 * mid-flight. Best-effort: the game already got ok:true, so failures are silent.
 */
async function speakOnEphemeralSocket(
  prompt: string,
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
): Promise<void> {
  const kidId = currentKidId;
  const gen = contextGeneration;
  const thisPool = pool;
  if (!kidId || !thisPool) {
    finishGameSpeech(set, get);
    return;
  }

  // A deaf session may hold a suspended AudioContext (it came up deaf without a
  // gesture). Scheduling audio into a suspended context would never sound, so
  // bail quietly rather than burn a socket on inaudible speech.
  const audioOk = (await streamer?.tryResume()) ?? false;
  if (
    !audioOk ||
    gen !== contextGeneration ||
    currentKidId !== kidId ||
    get().state !== "deaf" ||
    get().muted ||
    !gameSpeechActive
  ) {
    finishGameSpeech(set, get);
    return;
  }

  try {
    const isGameContext = get().context.type === "game";
    const acquired = await thisPool.acquire(
      createEventHandler(set, get, kidId, gen, isGameContext),
    );
    if (
      gen !== contextGeneration ||
      pool !== thisPool ||
      currentKidId !== kidId ||
      get().state !== "deaf" ||
      get().muted ||
      !gameSpeechActive
    ) {
      thisPool.retire(acquired);
      finishGameSpeech(set, get);
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
    finishGameSpeech(set, get);
  }
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
    const st = get();
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

    // Deaf means "ears off, voice on": a game may still ask dodi to speak.
    if (st.state === "deaf") {
      resetInactivityTimer();
      if (sessionStrategy === "persistent") {
        // The socket stays open while deaf on the persistent strategy — inject
        // directly. Kick the AudioContext in case it went suspended.
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
      void speakOnEphemeralSocket(prompt, set, get);
      return { ok: true };
    }

    // sleep / disconnected / connecting: nothing to speak through.
    return { ok: false, error: "voice_unavailable" };
  },

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

    // Bind the volume store to this kid so the header slider and the streamer
    // agree on (and persist to) the same per-kid level.
    useCompanionVolumeStore.getState().bindKid(kidId);

    const gen = ++contextGeneration;
    const controller = new AbortController();
    abortController = controller;

    set({
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

      streamer = createStreamer();

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

  activate: async (options) => {
    // `deliberate` false is KidChrome's any-click gesture handler, which only
    // exists to lift the transient "audio needs a gesture" deaf. A kid who
    // deliberately turned dodi's listening off stays deaf until actually tapped
    // awake — an incidental click must neither wake her nor clear the toggle.
    const deliberate = options?.deliberate ?? true;
    const current = get();
    if (current.state !== "deaf") return;
    if (!currentKidId) return;
    if (sessionStrategy === "persistent" && !client) return;
    if (!deliberate && isPresencePersisted(currentKidId, "deafened_dodi_at")) return;

    // A game read-aloud may be borrowing a pooled socket right now (deaf can
    // still speak). Retire it before acquiring the active socket so we don't
    // orphan it. No-op on the persistent strategy / when nothing is speaking.
    finishGameSpeech(set, get);

    // Prime AudioContext from user gesture — must stay synchronous inside the
    // gesture (autoplay unlock), before any await below.
    if (!streamer) {
      streamer = createStreamer();
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
    // next connect comes up listening. (No-ops if it wasn't set.) Output mute
    // is a separate toggle and is intentionally left as-is.
    if (deliberate) persistPresenceField("deafened_dodi_at", false);
  },

  deactivate: () => {
    const current = get();
    if (current.state !== "active") return;

    transitionToDeaf(set, true);
    // The kid deliberately turned dodi's listening off → persist it so she
    // stays deaf across reconnects, navigations and reloads until re-enabled.
    persistPresenceField("deafened_dodi_at", true);
  },

  setMuted: (muted, kidId) => {
    if (get().muted === muted) return;
    // Output-only: mute never changes whether dodi is listening (deaf/active),
    // only whether she can be heard. So it touches no session state beyond
    // cutting audio that is already playing or queued.
    set({ muted });
    persistPresenceField("muted_dodi_at", muted, kidId ?? currentKidId);
    if (muted) {
      set({ dodiSpeaking: false });
      streamer?.stop();
      // A game read-aloud in flight must fall silent immediately too.
      finishGameSpeech(set, get);
    }
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

    // Leaving the kid view is a common exit right after toggling — retry the
    // parked presence toggles now (keepalive carries them past the navigation)
    // instead of waiting for the next bring-up. No-ops when nothing is parked.
    if (currentKidId) flushAllPresenceOutboxes(currentKidId);

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

      case "audio": {
        // Output mute drops audio unconditionally — dodi may still hear and
        // think, she just can't be heard. Never flag her as speaking.
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
          const elapsed = Math.round(performance.now() - tapStartedAtMs);
          tapStartedAtMs = null;
          console.info("tap_to_first_audio_ms", elapsed);
        }
        set({ dodiSpeaking: true });
        streamer?.addPcmChunk(event.data);
        break;
      }

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
        // A deaf read-aloud runs without a greeting; keep its transcript so the
        // conversation record stays complete. (Muted+active still greeted, so
        // its inaudible replies are recorded as usual.)
        if (!greetingSent && !gameSpeechActive) return;
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

        // A deaf read-aloud completes here too (it may have no greeting) — end
        // it before the greeting gate so the borrowed pooled socket is retired
        // and the speaking indicator clears.
        if (gameSpeechActive) {
          set({ dodiSpeaking: false });
          finishGameSpeech(set, get);
        }

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

      case "interrupted": {
        const wasGameSpeech = gameSpeechActive;
        if (wasGameSpeech) finishGameSpeech(set, get);
        if (!greetingSent && !wasGameSpeech) return;
        set({ dodiSpeaking: false });
        streamer?.stop();
        break;
      }

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

// Push live volume changes into the playing streamer's master gain. The volume
// store is a leaf (no imports back into this module), so the subscription can't
// cycle. Fires only on change; a null streamer (idle) picks the level up at its
// next creation via createStreamer().
useCompanionVolumeStore.subscribe((s) => {
  streamer?.setVolume(s.volume);
});
