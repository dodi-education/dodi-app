import { dodi } from "@/lib/api";
import { create } from "zustand";

import {
  GeminiLiveClient,
  type GeminiLiveEvent,
  type GeminiLiveToolDeclaration,
} from "@/lib/ai/gemini-live-client";
import { AudioStreamer } from "@/lib/ai/audio-streamer";
import { AudioRecorder } from "@/lib/ai/audio-recorder";
import { buildGameVoiceConfig, buildHomeVoiceConfig } from "@/lib/ai/voice-session";
import { runClientMemoryUpdate } from "@/lib/ai/client-memory-update";
import { runGameTextAssistant } from "@/lib/ai/client-game-assistant";
import { extractCommandMarkers } from "@dodi/games/command-markers";
import { gameDebug, gameDebugWarn } from "@dodi/games/debug";
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
      markdown: string;
      codeBundle: string;
      gameState: Record<string, unknown>;
    };

export type DodiState = "disconnected" | "connecting" | "active" | "deaf" | "sleep";

export interface CompanionMessage {
  id: string;
  role: "kid" | "dodi";
  text: string;
}

// One round/response, coalesced from the streaming transcription fragments of a
// single speaker run (not one entry per word chunk).
interface TranscriptEntry {
  role: "dodi" | "kid";
  text: string;
  timestamp: string; // when the round started
}

// One Dodi voice session — the rounds exchanged after a single connect.
interface SessionTranscript {
  startedAt: string; // connect / session start (ISO)
  entries: TranscriptEntry[];
}

// Today's accumulating transcript for one kid, stamped with the local day it
// belongs to. Grows across every session within the day; promoted to the pending
// outbox once a new day's first connect sees a stale `date`.
interface CurrentBatch {
  kidId: string;
  date: string; // local YYYY-MM-DD
  sessions: SessionTranscript[];
}

// The outbox: sessions awaiting a successful encrypted write to the DB. Cleared
// only after `runClientMemoryUpdate` confirms the PATCH, so a failed or vault-
// locked attempt is retried on the next connect rather than lost.
interface PendingBatch {
  kidId: string;
  sessions: SessionTranscript[];
}

interface GameVoiceSessionConfig {
  apiKey: string;
  model: string;
  voiceName: string;
  systemInstruction: string;
  tools?: GeminiLiveToolDeclaration[];
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
  // Game snapshot callback (for read_game_state vision analysis)
  onRequestSnapshot: (() => Promise<string | null>) | null;

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
  updateGameState: (state: Record<string, unknown>, immediate?: boolean) => void;
  setOnRunCommands: (handler: ((commands: GameCommand[]) => void) | null) => void;
  setOnRequestSnapshot: (handler: (() => Promise<string | null>) | null) => void;
}

// ---------------------------------------------------------------------------
// External refs (outside Zustand to avoid serialization)
// ---------------------------------------------------------------------------

let client: GeminiLiveClient | null = null;
let streamer: AudioStreamer | null = null;
let recorder: AudioRecorder | null = null;
let abortController: AbortController | null = null;

let currentKidId: string | null = null;
// Today's sessions, loaded from the stored CurrentBatch at connect and mirrored
// to localStorage at the end of each round.
let daySessions: SessionTranscript[] = [];
// The session opened by the current connect — lazily appended to daySessions on
// its first completed round (so empty sessions are never stored).
let currentSession: SessionTranscript | null = null;
// Round coalescer: streaming transcription fragments accumulate here until the
// speaker changes or the turn completes, then flush as ONE entry.
let roundRole: "kid" | "dodi" | null = null;
let roundText = "";
let roundStartedAt: string | null = null;
let sessionStartedAt: string | null = null;
// Single-tab guard so a manual trigger + an auto-connect (or two connects)
// can't submit the same pending batch to the thinking model twice.
let memoryDrainInFlight = false;
let greetingSent = false;
let hasGreetedThisPageLoad = false;
let sessionIsBirthday = false;
let micRequestInFlight = false;
let tapStartedAtMs: number | null = null;

// Game voice state refs
let turnBuffer = "";
let gameAssistanceTurns = 0;
let lastSentGameState = "";
let stateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let stateSequenceNumber = 0;
let pendingGameState: string | null = null;

// Turn tracking (debugging)
let turnNumber = 0;
let turnAudioChunks = 0;

// Context switch generation counter (prevents stale async from applying)
let contextGeneration = 0;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Minimum accumulated entries before a day's batch is worth submitting to the
// thinking model (skipped unless a manual trigger forces it).
const MIN_MEMORY_BATCH_ENTRIES = 3;
// Hard cap on the pending outbox so a long stretch of unprocessable days (vault
// never unlocked, no thinking provider) can't grow past the localStorage quota.
// Oldest entries are dropped first — memory is a rolling dossier, not an audit log.
const MAX_PENDING_ENTRIES = 2000;
const MAX_MESSAGES = 40;
const STATE_DEBOUNCE_MS = 500;
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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

  // Flush the in-progress round + day sessions; do NOT process or clear — memory
  // is processed as one chunk on the next day's first connect.
  flushRound();
  persistToLocalStorage();

  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("pagehide", handlePageHide);
  stopInteractionListeners();

  currentKidId = null;
  daySessions = [];
  currentSession = null;
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
// Transcript / outbox helpers
// ---------------------------------------------------------------------------

/** Local calendar day as YYYY-MM-DD (en-CA renders ISO-shaped). */
function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

function currentKey(kidId: string): string {
  return `dodi-transcript-${kidId}`;
}

function pendingKey(kidId: string): string {
  return `dodi-memory-pending-${kidId}`;
}

function totalEntries(sessions: SessionTranscript[]): number {
  return sessions.reduce((n, s) => n + s.entries.length, 0);
}

function formatTranscript(sessions: SessionTranscript[]): string {
  return sessions
    .map((s) => {
      const body = s.entries
        .map(
          (e) =>
            `[${e.timestamp}] ${e.role === "dodi" ? "Dodi" : "Kid"}: ${e.text}`,
        )
        .join("\n");
      return `### Session ${s.startedAt}\n${body}`;
    })
    .join("\n\n");
}

function readCurrent(kidId: string): CurrentBatch | null {
  try {
    const raw = localStorage.getItem(currentKey(kidId));
    if (!raw) return null;
    return JSON.parse(raw) as CurrentBatch;
  } catch {
    return null;
  }
}

function writeCurrent(kidId: string, batch: CurrentBatch): void {
  try {
    localStorage.setItem(currentKey(kidId), JSON.stringify(batch));
  } catch {
    // ignore (quota / unavailable)
  }
}

function clearCurrent(kidId: string): void {
  try {
    localStorage.removeItem(currentKey(kidId));
  } catch {
    // ignore
  }
}

function readPending(kidId: string): PendingBatch | null {
  try {
    const raw = localStorage.getItem(pendingKey(kidId));
    if (!raw) return null;
    return JSON.parse(raw) as PendingBatch;
  } catch {
    return null;
  }
}

// Cap total pending entries so a long unprocessable stretch can't exceed the
// localStorage quota; drop whole oldest sessions first (never truncate within a
// session, so a round stays intact).
function capPendingSessions(sessions: SessionTranscript[]): SessionTranscript[] {
  const out = [...sessions];
  let total = totalEntries(out);
  while (total > MAX_PENDING_ENTRIES && out.length > 1) {
    total -= out[0].entries.length;
    out.shift();
  }
  return out;
}

function writePending(kidId: string, sessions: SessionTranscript[]): void {
  try {
    const data: PendingBatch = {
      kidId,
      sessions: capPendingSessions(sessions),
    };
    localStorage.setItem(pendingKey(kidId), JSON.stringify(data));
  } catch {
    // ignore
  }
}

function clearPending(kidId: string): void {
  try {
    localStorage.removeItem(pendingKey(kidId));
  } catch {
    // ignore
  }
}

/** Append sessions to the outbox (oldest dropped past MAX_PENDING_ENTRIES). */
function appendToPending(kidId: string, sessions: SessionTranscript[]): void {
  const existing = readPending(kidId)?.sessions ?? [];
  writePending(kidId, [...existing, ...sessions]);
}

/** Mirror today's sessions to the dated current-day key. */
function persistToLocalStorage(): void {
  if (!currentKidId) return;
  writeCurrent(currentKidId, {
    kidId: currentKidId,
    date: localDay(),
    sessions: daySessions,
  });
}

/** Lazily create the session opened by the current connect (no empty sessions). */
function ensureCurrentSession(): SessionTranscript {
  if (!currentSession) {
    currentSession = {
      startedAt: sessionStartedAt ?? new Date().toISOString(),
      entries: [],
    };
    daySessions.push(currentSession);
  }
  return currentSession;
}

/** Finalize the buffered speaker-run into a single transcript entry. */
function flushRound(): void {
  const text = roundText.trim();
  if (roundRole && text) {
    ensureCurrentSession().entries.push({
      role: roundRole,
      text,
      timestamp: roundStartedAt ?? new Date().toISOString(),
    });
    persistToLocalStorage();
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
 * If the stored current batch belongs to a previous day, move it into the
 * pending outbox. Writes pending BEFORE clearing current so a crash/quota-throw
 * between the two can never lose the day's transcript (worst case it lingers in
 * both keys and is re-promoted, which the thinking model reconciles).
 */
function promoteStaleDay(kidId: string): void {
  const current = readCurrent(kidId);
  if (!current || totalEntries(current.sessions) === 0) return;
  // A missing date (written by older code) is treated as stale.
  if (current.date === localDay()) return;
  appendToPending(kidId, current.sessions);
  clearCurrent(kidId);
}

/**
 * Submit the outbox to the thinking model as one chunk; clear it only on a
 * confirmed write. Guarded against concurrent drains; skips below the minimum
 * unless `force` (manual trigger).
 */
function drainPending(kidId: string, force: boolean): void {
  if (memoryDrainInFlight) return;
  const pending = readPending(kidId);
  const count = pending ? totalEntries(pending.sessions) : 0;
  if (count === 0) return;
  if (!force && count < MIN_MEMORY_BATCH_ENTRIES) return;

  memoryDrainInFlight = true;
  void runClientMemoryUpdate(kidId, formatTranscript(pending!.sessions))
    .then((ok) => {
      if (ok) clearPending(kidId);
    })
    .catch(() => {
      // keep the outbox for retry
    })
    .finally(() => {
      memoryDrainInFlight = false;
    });
}

// ---------------------------------------------------------------------------
// Page lifecycle handlers
// ---------------------------------------------------------------------------

// On unload we flush the in-progress round and persist the day's sessions to
// localStorage; the next connect promotes/processes them entirely client-side.
// We deliberately do NOT POST the raw transcript to the server — under E2EE it
// must never see the plaintext transcript.
function handleBeforeUnload(): void {
  flushRound();
  persistToLocalStorage();
}

function handlePageHide(): void {
  flushRound();
  persistToLocalStorage();
}

// ---------------------------------------------------------------------------
// Resource cleanup
// ---------------------------------------------------------------------------

function clearStateDebounce(): void {
  if (stateDebounceTimer) {
    clearTimeout(stateDebounceTimer);
    stateDebounceTimer = null;
  }
}

function flushPendingState(): void {
  if (!stateDebounceTimer || !pendingGameState || !client) return;
  clearStateDebounce();
  if (pendingGameState === lastSentGameState) return;
  lastSentGameState = pendingGameState;
  stateSequenceNumber++;
  gameDebug("voice", `Flushing pending state #${stateSequenceNumber} (${pendingGameState.length} chars)`);
  client.sendContext(
    `[GAME STATE UPDATE #${stateSequenceNumber}]\nThis is the CURRENT game state. Previous updates are outdated.\n${pendingGameState}`,
  );
  pendingGameState = null;
}

function cleanup(): void {
  abortController?.abort();
  abortController = null;

  recorder?.stop();
  recorder = null;

  streamer?.stop();
  streamer?.destroy();
  streamer = null;

  client?.disconnect();
  client = null;

  clearStateDebounce();
  clearInactivityTimer();
  stopInteractionListeners();
  turnNumber = 0;
  turnAudioChunks = 0;
  turnBuffer = "";
  gameAssistanceTurns = 0;
  lastSentGameState = "";
  stateSequenceNumber = 0;
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

  resetInactivityTimer();
  startInteractionListeners();

  // Start mic
  void startMic(set, get);
}

function transitionToDeaf(
  set: (partial: Partial<DodiSessionState>) => void,
  manual: boolean,
): void {
  recorder?.stop();
  recorder = null;
  streamer?.stop();

  set({
    state: "deaf",
    gestureNeeded: !manual,
    dodiSpeaking: false,
  });

  // Keep inactivity timer running — if no interaction for 5 min in deaf mode, sleep
  resetInactivityTimer();
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
  // same game: no reconnect
  if (a.type === "game" && b.type === "game" && a.gameId === b.gameId) {
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

    // Context requires reconnect (e.g., home/browse <-> game, or game <-> different game)
    const gen = ++contextGeneration;

    // Stop audio but don't fire memory update — transcript persists
    recorder?.stop();
    recorder = null;
    client?.disconnect();
    client = null;
    clearStateDebounce();
    turnBuffer = "";
    lastSentGameState = "";

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
        config = await buildGameVoiceConfig(
          kidId,
          newContext.gameId,
          newContext.gameState,
        );
        if (gen !== contextGeneration || controller.signal.aborted) return;
      } else {
        // Home/browse context — build client-side from the vault (E2EE).
        config = await buildHomeVoiceConfig(kidId);
        if (gen !== contextGeneration || controller.signal.aborted) return;
      }

      if (gen !== contextGeneration || controller.signal.aborted) return;

      sessionIsBirthday = config.isBirthday ?? false;

      if (!streamer) {
        streamer = new AudioStreamer();
      }

      const isGameContext = newContext.type === "game";
      const handleEvent = createEventHandler(set, get, kidId, gen, isGameContext);
      client = new GeminiLiveClient(config, handleEvent);
      client.connect();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (gen !== contextGeneration) return;
      const message = err instanceof Error ? err.message : "Failed to switch context";
      // Same as connect(): a failed config build won't recover on auto-retry, so
      // mark it fatal to stop the disconnected→reconnect hot-loop.
      set({ state: "disconnected", error: message, fatalError: true });
    }
  },

  connect: async (kidId: string) => {
    if (!kidId) return;

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
      // Different kid — teardown
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      cleanup();
      resetFlowFlags();
    }

    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("pagehide", handlePageHide);
    cleanup();

    // Day-batch memory: promote a previous day's sessions into the outbox, drain
    // the outbox (one chunk to the thinking model), then load today's sessions so
    // this connect appends a fresh session to them. Nothing is cleared except on
    // a confirmed encrypted write (inside drainPending).
    promoteStaleDay(kidId);
    drainPending(kidId, false);
    const todayBatch = readCurrent(kidId);
    daySessions =
      todayBatch && todayBatch.date === localDay() ? todayBatch.sessions : [];
    currentSession = null;
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
      const currentContext = get().context;
      let config: GameVoiceSessionConfig;

      if (currentContext.type === "game") {
        config = await buildGameVoiceConfig(
          kidId,
          currentContext.gameId,
          currentContext.gameState,
        );
        if (gen !== contextGeneration || controller.signal.aborted) return;
      } else {
        config = await buildHomeVoiceConfig(kidId);
        if (gen !== contextGeneration || controller.signal.aborted) return;
      }

      if (gen !== contextGeneration || controller.signal.aborted) return;

      sessionIsBirthday = config.isBirthday ?? false;

      streamer = new AudioStreamer();

      const isGameContext = currentContext.type === "game";
      const handleEvent = createEventHandler(set, get, kidId, gen, isGameContext);
      client = new GeminiLiveClient(config, handleEvent);
      client.connect();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
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
    if (!client || !currentKidId) return;

    // Prime AudioContext from user gesture
    if (!streamer) {
      streamer = new AudioStreamer();
    }
    streamer.primeFromGesture();
    tapStartedAtMs = performance.now();

    transitionToActive(set, get);
  },

  deactivate: () => {
    const current = get();
    if (current.state !== "active") return;

    transitionToDeaf(set, true);
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

    // Flush the in-progress round + day sessions so the next connect can
    // promote/process them; do NOT process or clear here (avoids fragmenting
    // the day).
    flushRound();
    persistToLocalStorage();

    currentKidId = null;
    daySessions = [];
    currentSession = null;
    sessionStartedAt = null;
    hasGreetedThisPageLoad = false;

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

    // Flush the in-progress round, then move EVERYTHING accumulated (today
    // included) into the outbox and reset the live sessions synchronously.
    // Rounds that arrive after this start a fresh current-day batch — so nothing
    // is double-processed and nothing is lost.
    if (currentKidId === kidId) {
      flushRound();
      persistToLocalStorage();
    }
    const current = readCurrent(kidId);
    if (current && totalEntries(current.sessions) > 0) {
      appendToPending(kidId, current.sessions);
    }
    clearCurrent(kidId);
    if (currentKidId === kidId) {
      daySessions = [];
      currentSession = null;
    }

    drainPending(kidId, true);
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

    const resolvedGameId = gameId ?? (state.context.type === "game" ? state.context.gameId : null);
    if (!resolvedGameId) {
      set({ chatSubmitting: false });
      return;
    }

    try {
      // Runs fully in the browser: the child's data + persona soul are E2EE and
      // the thinking key lives only in the unlocked vault, so the server can
      // neither assemble the prompt nor run this. Mirrors the voice companion.
      const data = await runGameTextAssistant(
        currentKidId,
        resolvedGameId,
        trimmed,
        state.context.type === "game" ? state.context.gameState : {},
      );

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

  updateGameState: (state: Record<string, unknown>, immediate?: boolean) => {
    const current = get();
    if (current.context.type !== "game") return;

    // Update context with new game state
    set({
      context: { ...current.context, gameState: state },
    });

    // Debounced sendContext for voice sessions
    if (!client || current.state !== "active") return;

    const stateJson = JSON.stringify(state);
    if (stateJson === lastSentGameState) return;

    const sendStateUpdate = () => {
      lastSentGameState = stateJson;
      pendingGameState = null;
      stateSequenceNumber++;
      const label = immediate ? "immediate" : "debounced";
      gameDebug("voice", `Sending ${label} game state update #${stateSequenceNumber} (${stateJson.length} chars)`);
      client?.sendContext(
        `[GAME STATE UPDATE #${stateSequenceNumber}]\nThis is the CURRENT game state. Previous updates are outdated.\n${stateJson}`,
      );
    };

    clearStateDebounce();

    if (immediate) {
      sendStateUpdate();
    } else {
      pendingGameState = stateJson;
      stateDebounceTimer = setTimeout(() => {
        sendStateUpdate();
        stateDebounceTimer = null;
      }, STATE_DEBOUNCE_MS);
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
): (event: GeminiLiveEvent) => void {
  return (event: GeminiLiveEvent): void => {
    if (generation !== contextGeneration) return;
    if (currentKidId !== kidId) return;

    switch (event.type) {
      case "setupComplete": {
        // Try to resume AudioContext without a gesture
        if (streamer) {
          void streamer.tryResume().then((audioOk) => {
            // Guard against stale callback
            if (generation !== contextGeneration) return;
            if (currentKidId !== kidId) return;

            if (audioOk) {
              transitionToActive(set, get);
            } else {
              transitionToDeaf(set, false);
            }
          });
        } else {
          transitionToDeaf(set, false);
        }
        break;
      }

      case "audio":
        if (!greetingSent) return;
        if (get().state !== "active") return;
        turnAudioChunks++;
        if (turnAudioChunks === 1) {
          gameDebug("voice", "First audio chunk this turn");
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
        flushPendingState();
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
        flushPendingState();
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
        } else if (event.name === "execute_game_command" && isGameContext) {
          const commandType = typeof event.args.type === "string" ? event.args.type : "";
          if (!commandType) {
            gameDebugWarn("voice", "Tool call missing command type");
            client?.sendToolResponse(event.id, event.name, {
              ok: false,
              error: "Missing command type",
            });
            return;
          }

          const payload = event.args.payload as GameCommand["payload"];
          const command: GameCommand = { type: commandType, payload };

          gameDebug("voice", "Executing game command from tool call:", command);
          const { onRunCommands } = get();
          if (onRunCommands) {
            onRunCommands([command]);
          }

          // Respond immediately
          client?.sendToolResponse(event.id, event.name, {
            ok: true,
            command: commandType,
          });
        } else if (event.name === "read_game_state" && isGameContext) {
          // Offload complex state analysis to the thinking model
          const question = typeof event.args.question === "string" ? event.args.question : "What is the current game state?";

          gameDebug("voice", `read_game_state: "${question}"`);

          const ctx = get().context;
          if (ctx.type !== "game") {
            client?.sendToolResponse(event.id, event.name, {
              ok: false,
              error: "Not in a game context",
            });
            return;
          }

          // Request canvas snapshot (if available), then send to thinking model.
          // Gemini holds the turn open until the tool response arrives.
          const snapshotHandler = get().onRequestSnapshot;
          const snapshotPromise = snapshotHandler
            ? snapshotHandler().catch(() => null)
            : Promise.resolve(null);

          snapshotPromise
            .then((snapshot) => {
              if (snapshot) {
                gameDebug("voice", `read_game_state: got snapshot (${snapshot.length} chars)`);
              }
              return dodi.request("/api/agent/sessions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  kidId,
                  taskType: "read_game_state",
                  gameId: ctx.gameId,
                  payload: {
                    gameState: ctx.gameState,
                    question,
                    gameMarkdown: ctx.markdown,
                    gameCodeBundle: ctx.codeBundle,
                    snapshot,
                  },
                }),
              });
            })
            .then(async (res) => {
              if (!res.ok) {
                const data = await res.json().catch(() => ({ error: "Analysis failed" }));
                throw new Error(data.error || "Analysis failed");
              }
              return res.json();
            })
            .then((result: { analysis: string }) => {
              gameDebug("voice", `read_game_state result: "${result.analysis.slice(0, 200)}"`);
              client?.sendToolResponse(event.id, event.name, {
                ok: true,
                analysis: result.analysis,
              });
            })
            .catch((err) => {
              const errMsg = err instanceof Error ? err.message : "Analysis failed";
              gameDebugWarn("voice", `read_game_state failed: ${errMsg}`);
              client?.sendToolResponse(event.id, event.name, {
                ok: false,
                error: `Analysis failed: ${errMsg}. Respond based on what you know from the game state.`,
              });
            });
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
        flushPendingState();
        break;

      case "error": {
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
