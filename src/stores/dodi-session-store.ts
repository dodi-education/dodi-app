import { create } from "zustand";

import {
  GeminiLiveClient,
  type GeminiLiveEvent,
  type GeminiLiveToolDeclaration,
} from "@/lib/ai/gemini-live-client";
import { AudioStreamer } from "@/lib/ai/audio-streamer";
import { AudioRecorder } from "@/lib/ai/audio-recorder";
import { extractCommandMarkers } from "@/lib/games/command-markers";
import { gameDebug, gameDebugWarn } from "@/lib/games/debug";
import type { GameAssistantResponse, GameCommand } from "@/types/games";
import type { AgentProgressEvent, AgentStep as AgentStepType, CreatingGameProgress } from "@/types/agent-progress";
import type { AgentSessionResult } from "@/types/database";

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
    }
  | { type: "creating"; gameId?: string; gamePlan?: string; gamePlanTitle?: string; gamePlanSubject?: string };

export type DodiState = "disconnected" | "connecting" | "active" | "deaf" | "sleep";

export interface CreatingGameState {
  title: string;
  description: string;
  subject: string;
  difficulty: string;
  tags: string[];
  codeBundle: string | null;
  markdown: string | null;
  savedGameId: string | null;
  dbSessionId: string | null;
  iterationCount: number;
  generating: boolean;
  progress: CreatingGameProgress | null;
}

export interface CompanionMessage {
  id: string;
  role: "kid" | "dodi";
  text: string;
}

interface TranscriptEntry {
  role: "dodi" | "kid";
  text: string;
  timestamp: string;
}

interface StoredTranscript {
  profileId: string;
  entries: TranscriptEntry[];
  sessionStartedAt: string;
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
  profileId: string | null;
  state: DodiState;
  dodiSpeaking: boolean;
  gestureNeeded: boolean;
  error: string | null;

  // Text chat (for game text mode)
  chatMessages: CompanionMessage[];
  chatSubmitting: boolean;

  // Game command callback
  onRunCommands: ((commands: GameCommand[]) => void) | null;
  // Game snapshot callback (for read_game_state vision analysis)
  onRequestSnapshot: (() => Promise<string | null>) | null;

  // Voice-to-game creation state
  creatingGame: CreatingGameState | null;

  // Navigation (set by launch_game/create_game tool, consumed by layout)
  pendingNavigation: string | null;
  clearPendingNavigation: () => void;

  // Game plan (set by create_game tool on home, consumed by GameVoiceCreator)
  consumeGamePlan: () => { plan: string; title: string; subject: string } | null;

  // Actions
  setContext: (context: DodiContext, profileId: string) => Promise<void>;
  setDisplayMode: (mode: DodiDisplayMode) => void;
  connect: (profileId: string) => Promise<void>;
  activate: () => Promise<void>;
  deactivate: () => void;
  toggleActive: () => void;
  endSession: () => void;
  sendTextMessage: (message: string, gameId?: string) => Promise<void>;
  updateGameState: (state: Record<string, unknown>, immediate?: boolean) => void;
  setOnRunCommands: (handler: ((commands: GameCommand[]) => void) | null) => void;
  setOnRequestSnapshot: (handler: (() => Promise<string | null>) | null) => void;
  setCreatingGame: (updates: Partial<CreatingGameState>) => void;
  clearCreatingGame: () => void;
  recoverAgentSession: (profileId: string, gameId?: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// External refs (outside Zustand to avoid serialization)
// ---------------------------------------------------------------------------

let client: GeminiLiveClient | null = null;
let streamer: AudioStreamer | null = null;
let recorder: AudioRecorder | null = null;
let abortController: AbortController | null = null;

let currentProfileId: string | null = null;
let transcript: TranscriptEntry[] = [];
let sessionStartedAt: string | null = null;
let greetingSent = false;
let hasGreetedThisPageLoad = false;
let sessionIsBirthday = false;
let micRequestInFlight = false;
let tapStartedAtMs: number | null = null;

// Game plan from home screen (consumed by GameVoiceCreator on mount)
let pendingGamePlan: { plan: string; title: string; subject: string } | null = null;

// Game voice state refs
let turnBuffer = "";
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

const MIN_MEMORY_UPDATE_ENTRIES = 3;
const MIN_BEACON_ENTRIES = 1;
const BEACON_MAX_BYTES = 60000;
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

  const pid = currentProfileId;

  // Fire memory update if enough transcript
  if (pid && transcript.length >= MIN_MEMORY_UPDATE_ENTRIES) {
    const formatted = formatTranscript(transcript);
    fetch("/api/ai/memory-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: pid,
        sessionTranscript: formatted,
      }),
    }).catch(() => {
      // non-critical
    });
  }

  if (pid) {
    clearLocalStorage(pid);
  }

  window.removeEventListener("beforeunload", handleBeforeUnload);
  window.removeEventListener("pagehide", handlePageHide);
  stopInteractionListeners();

  currentProfileId = null;
  transcript = [];
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
// Transcript helpers
// ---------------------------------------------------------------------------

function storageKey(profileId: string): string {
  return `dodi-transcript-${profileId}`;
}

function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map(
      (e) =>
        `[${e.timestamp}] ${e.role === "dodi" ? "Dodi" : "Kid"}: ${e.text}`,
    )
    .join("\n");
}

function persistToLocalStorage(): void {
  if (!currentProfileId) return;
  try {
    const data: StoredTranscript = {
      profileId: currentProfileId,
      entries: transcript,
      sessionStartedAt: sessionStartedAt ?? new Date().toISOString(),
    };
    localStorage.setItem(storageKey(currentProfileId), JSON.stringify(data));
  } catch {
    // ignore
  }
}

function readLocalStorage(profileId: string): StoredTranscript | null {
  try {
    const raw = localStorage.getItem(storageKey(profileId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredTranscript;
  } catch {
    return null;
  }
}

function clearLocalStorage(profileId: string): void {
  try {
    localStorage.removeItem(storageKey(profileId));
  } catch {
    // ignore
  }
}

function persistToLocalStorageRaw(
  profileId: string,
  data: StoredTranscript,
): void {
  try {
    localStorage.setItem(storageKey(profileId), JSON.stringify(data));
  } catch {
    // ignore
  }
}

function sendTranscriptBeacon(): void {
  if (!currentProfileId) return;

  const stored = readLocalStorage(currentProfileId);
  if (!stored || stored.entries.length < MIN_BEACON_ENTRIES) return;

  const formatted = formatTranscript(stored.entries);
  const payload = JSON.stringify({
    profileId: stored.profileId,
    sessionTranscript: formatted,
  });

  let finalPayload = payload;
  if (new Blob([payload]).size > BEACON_MAX_BYTES) {
    const entries = [...stored.entries];
    while (entries.length > MIN_BEACON_ENTRIES) {
      entries.shift();
      const truncated = JSON.stringify({
        profileId: stored.profileId,
        sessionTranscript: formatTranscript(entries),
      });
      if (new Blob([truncated]).size <= BEACON_MAX_BYTES) {
        finalPayload = truncated;
        break;
      }
    }
  }

  clearLocalStorage(currentProfileId);

  try {
    const blob = new Blob([finalPayload], { type: "application/json" });
    const sent = navigator.sendBeacon("/api/ai/memory-update", blob);
    if (!sent) {
      persistToLocalStorageRaw(currentProfileId, stored);
    }
  } catch {
    persistToLocalStorageRaw(currentProfileId, stored);
  }
}

// ---------------------------------------------------------------------------
// Page lifecycle handlers
// ---------------------------------------------------------------------------

function handleBeforeUnload(): void {
  sendTranscriptBeacon();
}

function handlePageHide(): void {
  sendTranscriptBeacon();
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
  stopRecoveryPolling();

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
  lastSentGameState = "";
  stateSequenceNumber = 0;
}

function resetFlowFlags(): void {
  greetingSent = false;
  sessionIsBirthday = false;
  micRequestInFlight = false;
  tapStartedAtMs = null;
}

function getGreetingMode(profileId: string, isBirthday: boolean): "long" | "short" | "birthday" {
  if (isBirthday) {
    const birthdayKey = `dodi-birthday-greeting-${profileId}`;
    const today = new Date().toISOString().slice(0, 10);
    try {
      if (localStorage.getItem(birthdayKey) !== today) {
        localStorage.setItem(birthdayKey, today);
        return "birthday";
      }
    } catch { /* fall through */ }
  }

  const key = `dodi-last-long-greeting-${profileId}`;
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
  if (!client || !currentProfileId) return;

  set({ state: "active", gestureNeeded: false, error: null });

  if (!greetingSent) {
    greetingSent = true;
    if (!sessionStartedAt) {
      sessionStartedAt = new Date().toISOString();
      window.addEventListener("beforeunload", handleBeforeUnload);
      window.addEventListener("pagehide", handlePageHide);
    }

    // When creating with a game plan from home, force-send a greeting even if
    // hasGreetedThisPageLoad is already true (the kid was chatting on home first).
    // The system instruction tells Dodi to call generate_game immediately.
    const ctx = get().context;
    const hasPlan = ctx.type === "creating" && !!ctx.gamePlan;

    if (!hasGreetedThisPageLoad || hasPlan) {
      hasGreetedThisPageLoad = true;
      const mode = getGreetingMode(currentProfileId!, sessionIsBirthday);
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
  if (!currentProfileId) return;

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
  // same creating context (same gameId or both no gameId): no reconnect
  if (
    a.type === "creating" &&
    b.type === "creating" &&
    a.gameId === b.gameId
  ) {
    return false;
  }
  // same type and both non-game, non-creating
  if (a.type === b.type && a.type !== "game" && a.type !== "creating") {
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

  profileId: null,
  state: "disconnected",
  dodiSpeaking: false,
  gestureNeeded: false,
  error: null,

  chatMessages: [],
  chatSubmitting: false,

  onRunCommands: null,
  onRequestSnapshot: null,

  creatingGame: null,

  pendingNavigation: null,
  clearPendingNavigation: () => {
    set({ pendingNavigation: null });
  },

  consumeGamePlan: () => {
    const plan = pendingGamePlan;
    pendingGamePlan = null;
    return plan;
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

  setCreatingGame: (updates) => {
    const current = get().creatingGame;
    if (current) {
      set({ creatingGame: { ...current, ...updates } });
    } else {
      set({
        creatingGame: {
          title: "",
          description: "",
          subject: "creativity",
          difficulty: "easy",
          tags: [],
          codeBundle: null,
          markdown: null,
          savedGameId: null,
          dbSessionId: null,
          iterationCount: 0,
          generating: false,
          progress: null,
          ...updates,
        },
      });
    }
  },

  clearCreatingGame: () => {
    set({ creatingGame: null });
  },

  recoverAgentSession: async (profileId: string, gameId?: string): Promise<boolean> => {
    return recoverAgentSessionFromDB(profileId, set, get, gameId);
  },

  setContext: async (newContext: DodiContext, profileId: string) => {
    const state = get();
    const oldContext = state.context;

    // If same context and same profile, just update gameState if needed
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
        const res = await fetch(`/api/games/${newContext.gameId}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId,
            gameState: newContext.gameState,
          }),
          signal: controller.signal,
        });

        if (gen !== contextGeneration || controller.signal.aborted) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Session failed" }));
          set({ state: "disconnected", error: data.error || "Session failed" });
          return;
        }
        config = await res.json();
      } else if (newContext.type === "creating") {
        const body: Record<string, string> = { profileId };
        if (newContext.gameId) body.gameId = newContext.gameId;
        if (newContext.gamePlan) body.gamePlan = newContext.gamePlan;
        if (newContext.gamePlanTitle) body.gamePlanTitle = newContext.gamePlanTitle;
        if (newContext.gamePlanSubject) body.gamePlanSubject = newContext.gamePlanSubject;

        const res = await fetch("/api/games/create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (gen !== contextGeneration || controller.signal.aborted) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Session failed" }));
          set({ state: "disconnected", error: data.error || "Session failed" });
          return;
        }
        config = await res.json();
      } else {
        const res = await fetch("/api/ai/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId }),
          signal: controller.signal,
        });

        if (gen !== contextGeneration || controller.signal.aborted) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Session failed" }));
          set({ state: "disconnected", error: data.error || "Session failed" });
          return;
        }
        config = await res.json();
      }

      if (gen !== contextGeneration || controller.signal.aborted) return;

      sessionIsBirthday = config.isBirthday ?? false;

      if (!streamer) {
        streamer = new AudioStreamer();
      }

      const isGameContext = newContext.type === "game";
      const isCreatingContext = newContext.type === "creating";
      const handleEvent = createEventHandler(set, get, profileId, gen, isGameContext, isCreatingContext);
      client = new GeminiLiveClient(config, handleEvent);
      client.connect();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (gen !== contextGeneration) return;
      const message = err instanceof Error ? err.message : "Failed to switch context";
      set({ state: "disconnected", error: message });
    }
  },

  connect: async (profileId: string) => {
    if (!profileId) return;

    const currentState = get();

    // Already connecting or connected for this profile
    if (
      currentProfileId === profileId &&
      (currentState.state === "connecting" ||
        currentState.state === "active" ||
        currentState.state === "deaf")
    ) {
      return;
    }

    if (currentProfileId && currentProfileId !== profileId) {
      // Different profile — teardown
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      cleanup();
      resetFlowFlags();
    }

    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("pagehide", handlePageHide);
    cleanup();

    // Recover unprocessed transcript from a previous crashed session
    const stored = readLocalStorage(profileId);
    if (stored && stored.entries.length >= MIN_BEACON_ENTRIES) {
      const formatted = formatTranscript(stored.entries);
      fetch("/api/ai/memory-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: stored.profileId,
          sessionTranscript: formatted,
        }),
      }).catch(() => {
        // Recovery failure is non-critical
      });
    }
    clearLocalStorage(profileId);

    currentProfileId = profileId;
    transcript = [];
    sessionStartedAt = null;
    greetingSent = false;
    micRequestInFlight = false;

    const gen = ++contextGeneration;
    const controller = new AbortController();
    abortController = controller;

    set({
      profileId,
      state: "connecting",
      dodiSpeaking: false,
      gestureNeeded: false,
      error: null,
    });

    try {
      const currentContext = get().context;
      let config: GameVoiceSessionConfig;

      if (currentContext.type === "game") {
        const res = await fetch(`/api/games/${currentContext.gameId}/session`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profileId,
            gameState: currentContext.gameState,
          }),
          signal: controller.signal,
        });

        if (gen !== contextGeneration || controller.signal.aborted) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed to connect" }));
          const errorMessage = data.error || `Session API returned ${res.status}`;
          set({ state: "disconnected", error: errorMessage });
          return;
        }
        config = await res.json();
      } else if (currentContext.type === "creating") {
        const body: Record<string, string> = { profileId };
        if (currentContext.gameId) body.gameId = currentContext.gameId;
        if (currentContext.gamePlan) body.gamePlan = currentContext.gamePlan;
        if (currentContext.gamePlanTitle) body.gamePlanTitle = currentContext.gamePlanTitle;
        if (currentContext.gamePlanSubject) body.gamePlanSubject = currentContext.gamePlanSubject;

        const res = await fetch("/api/games/create-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (gen !== contextGeneration || controller.signal.aborted) return;

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Failed to connect" }));
          const errorMessage = data.error || `Session API returned ${res.status}`;
          set({ state: "disconnected", error: errorMessage });
          return;
        }
        config = await res.json();
      } else {
        const sessionRes = await fetch("/api/ai/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId }),
          signal: controller.signal,
        });

        if (gen !== contextGeneration || controller.signal.aborted) return;

        if (!sessionRes.ok) {
          const data = await sessionRes
            .json()
            .catch(() => ({ error: "Failed to connect" }));
          const errorMessage = data.error || `Session API returned ${sessionRes.status}`;
          set({ state: "disconnected", error: errorMessage });
          return;
        }
        config = await sessionRes.json();
      }

      if (gen !== contextGeneration || controller.signal.aborted) return;

      sessionIsBirthday = config.isBirthday ?? false;

      streamer = new AudioStreamer();

      const isGameContext = currentContext.type === "game";
      const isCreatingContext = currentContext.type === "creating";
      const handleEvent = createEventHandler(set, get, profileId, gen, isGameContext, isCreatingContext);
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
      });
    }
  },

  activate: async () => {
    const current = get();
    if (current.state !== "deaf") return;
    if (!client || !currentProfileId) return;

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
    } else if ((current.state === "disconnected" || current.state === "sleep") && current.profileId) {
      void get().connect(current.profileId);
    }
    // connecting: no-op
  },

  endSession: () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("pagehide", handlePageHide);

    const pid = currentProfileId;

    if (pid && transcript.length >= MIN_MEMORY_UPDATE_ENTRIES) {
      const formatted = formatTranscript(transcript);
      fetch("/api/ai/memory-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: pid,
          sessionTranscript: formatted,
        }),
      }).catch(() => {
        // non-critical
      });
    }

    if (pid) {
      clearLocalStorage(pid);
    }

    currentProfileId = null;
    transcript = [];
    sessionStartedAt = null;
    hasGreetedThisPageLoad = false;

    cleanup();
    resetFlowFlags();

    set({
      profileId: null,
      state: "disconnected",
      dodiSpeaking: false,
      gestureNeeded: false,
      error: null,
      chatMessages: [],
      chatSubmitting: false,
      pendingNavigation: null,
    });
  },

  sendTextMessage: async (message: string, gameId?: string) => {
    const trimmed = message.trim();
    if (!trimmed || !currentProfileId) return;

    const state = get();
    if (state.chatSubmitting) return;

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
      const response = await fetch(`/api/games/${resolvedGameId}/assistant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: currentProfileId,
          message: trimmed,
          gameState: state.context.type === "game" ? state.context.gameState : {},
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Assistant failed" }));
        throw new Error(data.error || "Assistant failed");
      }

      const data = (await response.json()) as GameAssistantResponse;

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
// Agent session recovery — polls DB when SSE stream is lost
// ---------------------------------------------------------------------------

let recoveryPollTimer: ReturnType<typeof setInterval> | null = null;

function mapProgressToStep(progress: string): AgentStepType {
  switch (progress) {
    case "planning":
      return "reading_docs";
    case "building":
      return "writing_code";
    case "testing":
      return "validating";
    case "done":
      return "finalizing";
    default:
      return "reading_docs";
  }
}

function stopRecoveryPolling(): void {
  if (recoveryPollTimer) {
    clearInterval(recoveryPollTimer);
    recoveryPollTimer = null;
  }
}

function startPollingForResult(
  sessionId: string,
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
): void {
  stopRecoveryPolling();

  recoveryPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/agent/sessions/${sessionId}`);
      if (!res.ok) {
        stopRecoveryPolling();
        return;
      }

      const session = await res.json();

      if (session.status === "active") {
        // Still running — update progress display
        const current = get().creatingGame;
        if (current) {
          set({
            creatingGame: {
              ...current,
              progress: {
                step: mapProgressToStep(session.progress),
                turn: current.progress?.turn ?? 0,
                startedAt: current.progress?.startedAt ?? new Date(session.created_at).getTime(),
              },
            },
          });
        }
        return; // Keep polling
      }

      // Terminal state — stop polling
      stopRecoveryPolling();

      if (session.status === "completed" && session.result) {
        const result = session.result as AgentSessionResult;
        const prev = get().creatingGame;
        set({
          creatingGame: {
            title: result.title,
            description: result.description,
            subject: result.subject,
            difficulty: result.difficulty,
            tags: result.tags,
            codeBundle: result.codeBundle,
            markdown: result.markdown,
            savedGameId: session.game_id ?? prev?.savedGameId ?? null,
            dbSessionId: session.id,
            iterationCount: result.iterationCount,
            generating: false,
            progress: null,
          },
        });
        gameDebug("voice", `recovery: session ${sessionId} completed, game recovered`);
        client?.sendContext(
          `[GAME READY] Game "${result.title}" was recovered from a previous session and is ready.`,
        );
      } else {
        // Failed or deactivated
        const current = get().creatingGame;
        if (current) {
          set({ creatingGame: { ...current, generating: false, progress: null } });
        }
        gameDebug("voice", `recovery: session ${sessionId} ended with status ${session.status}`);
      }
    } catch {
      stopRecoveryPolling();
    }
  }, 3000); // Poll every 3 seconds
}

async function recoverAgentSessionFromDB(
  profileId: string,
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
  gameId?: string,
): Promise<boolean> {
  try {
    let url = `/api/agent/sessions/active?profileId=${profileId}&context=game_creation`;
    if (gameId) {
      url += `&gameId=${gameId}`;
    }

    const res = await fetch(url);
    if (!res.ok) return false;

    const session = await res.json();
    if (!session) return false;

    // Grab whatever state was already initialized (from props or plan)
    const existing = get().creatingGame;

    if (session.status === "active") {
      // Session is still running — merge progress into existing state and start polling
      gameDebug("voice", `recovery: found active session ${session.id}, polling...`);
      set({
        creatingGame: {
          title: existing?.title ?? "",
          description: existing?.description ?? "",
          subject: existing?.subject ?? "creativity",
          difficulty: existing?.difficulty ?? "easy",
          tags: existing?.tags ?? [],
          codeBundle: existing?.codeBundle ?? null,
          markdown: existing?.markdown ?? null,
          savedGameId: existing?.savedGameId ?? session.game_id ?? null,
          dbSessionId: session.id,
          iterationCount: existing?.iterationCount ?? 0,
          generating: true,
          progress: {
            step: mapProgressToStep(session.progress),
            turn: 0,
            startedAt: new Date(session.created_at).getTime(),
          },
        },
      });
      startPollingForResult(session.id, set, get);
      return true;
    }

    if (session.status === "completed" && session.result) {
      // Recent completed session — recover the result
      gameDebug("voice", `recovery: found completed session ${session.id}, restoring result`);
      const result = session.result as AgentSessionResult;
      set({
        creatingGame: {
          title: result.title,
          description: result.description,
          subject: result.subject,
          difficulty: result.difficulty,
          tags: result.tags,
          codeBundle: result.codeBundle,
          markdown: result.markdown,
          savedGameId: session.game_id ?? existing?.savedGameId ?? null,
          dbSessionId: session.id,
          iterationCount: result.iterationCount,
          generating: false,
          progress: null,
        },
      });
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// SSE progress stream reader
// ---------------------------------------------------------------------------

const VOICE_PROGRESS_MESSAGES: Record<string, string> = {
  writing_code: "[PROGRESS] Writing the game code now...",
  validating: "[PROGRESS] Almost done! Checking everything works...",
  fixing_validation: "[PROGRESS] Found a small thing to fix, working on it...",
};

async function readProgressStream(
  body: ReadableStream<Uint8Array>,
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
): Promise<AgentProgressEvent & { type: "complete" | "error" }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // Parse SSE lines
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json) continue;

      let event: AgentProgressEvent;
      try {
        event = JSON.parse(json) as AgentProgressEvent;
      } catch {
        continue;
      }

      if (event.type === "session_started") {
        // Store DB session ID so we can poll if SSE disconnects
        const current = get().creatingGame;
        if (current) {
          set({ creatingGame: { ...current, dbSessionId: event.sessionId } });
        }
      } else if (event.type === "step") {
        const current = get().creatingGame;
        if (current) {
          set({
            creatingGame: {
              ...current,
              progress: {
                step: event.step,
                turn: event.turn,
                startedAt: current.progress?.startedAt ?? Date.now(),
              },
            },
          });
        }

        // Inject voice context for significant steps
        const voiceMsg = VOICE_PROGRESS_MESSAGES[event.step];
        if (voiceMsg && client) {
          client.sendContext(voiceMsg);
        }
      } else if (event.type === "complete") {
        return event;
      } else if (event.type === "error") {
        return event;
      }
      // validation events: no special handling on client (visual step is enough)
    }
  }

  // Stream ended without complete/error — treat as error
  return { type: "error", message: "Stream ended unexpectedly" };
}

// ---------------------------------------------------------------------------
// Voice-to-game creation tool handlers
// ---------------------------------------------------------------------------

function handleCreationToolCall(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
  event: { id: string; name: string; args: Record<string, unknown> },
  mode: "generate" | "update",
): void {
  const current = get().creatingGame;

  if (mode === "generate") {
    const prompt = typeof event.args.prompt === "string" ? event.args.prompt : "";
    if (!prompt) {
      gameDebugWarn("voice", "generate_game: missing prompt");
      client?.sendToolResponse(event.id, event.name, {
        ok: false,
        error: "Missing prompt in tool call",
      });
      return;
    }

    const title = typeof event.args.title === "string" ? event.args.title : (current?.title ?? "");
    const subject = typeof event.args.subject === "string" ? event.args.subject : (current?.subject ?? "creativity");

    // Respond immediately so Dodi keeps talking
    client?.sendToolResponse(event.id, event.name, {
      ok: true,
      status: "generating",
    });

    gameDebug("voice", `generate_game: requesting generation...`);

    // Set generating state
    const genState: CreatingGameState = {
      title,
      description: current?.description ?? "",
      subject,
      difficulty: typeof event.args.difficulty === "string" ? event.args.difficulty : (current?.difficulty ?? "easy"),
      tags: Array.isArray(event.args.tags) ? event.args.tags.filter((t): t is string => typeof t === "string") : (current?.tags ?? []),
      codeBundle: current?.codeBundle ?? null,
      markdown: current?.markdown ?? null,
      savedGameId: current?.savedGameId ?? null,
      dbSessionId: current?.dbSessionId ?? null,
      iterationCount: current?.iterationCount ?? 0,
      generating: true,
      progress: null,
    };
    set({ creatingGame: genState });

    // Call coding agent via SSE
    fetch("/api/agent/task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        profileId: currentProfileId,
        taskType: "generate_game",
        gameId: current?.savedGameId ?? undefined,
        payload: {
          prompt,
          title,
          subject,
          difficulty: typeof event.args.difficulty === "string" ? event.args.difficulty : undefined,
          tags: Array.isArray(event.args.tags) ? event.args.tags.filter((t: unknown): t is string => typeof t === "string") : undefined,
        },
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Generation failed" }));
          if (data.busy) throw new Error("AGENT_BUSY");
          throw new Error(data.error || "Generation failed");
        }

        if (!res.body) throw new Error("No response body");
        const outcome = await readProgressStream(res.body, set, get);

        if (outcome.type === "error") {
          throw new Error(outcome.message);
        }

        const result = outcome.result;
        gameDebug("voice", `generate_game: received (${result.codeBundle.length} chars, ${result.iterationCount} iterations)`);
        const prev = get().creatingGame;
        const nextIteration = (prev?.iterationCount ?? 0) + 1;
        set({
          creatingGame: {
            title: result.title || title,
            description: result.description || "",
            subject: result.subject || subject,
            difficulty: result.difficulty || "easy",
            tags: result.tags || [],
            codeBundle: result.codeBundle,
            markdown: result.markdown || "",
            savedGameId: result.savedGameId ?? prev?.savedGameId ?? null,
            dbSessionId: prev?.dbSessionId ?? null,
            iterationCount: nextIteration,
            generating: false,
            progress: null,
          },
        });
        client?.sendContext(
          `[GAME READY] The game "${result.title}" has been generated and is now visible to the child. ` +
          `Tell them their game is ready and encourage them to try it! If they want changes, use update_game.`,
        );
      })
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : "Generation failed";
        gameDebugWarn("voice", `generate_game failed: ${errMsg}`);
        const prev = get().creatingGame;
        if (prev) {
          set({ creatingGame: { ...prev, generating: false, progress: null } });
        }
        if (errMsg === "AGENT_BUSY") {
          client?.sendContext(
            `[AGENT BUSY] Still working on the previous request. Tell the child to wait a moment.`,
          );
        } else {
          client?.sendContext(
            `[GENERATION FAILED] The game could not be generated: ${errMsg}. ` +
            `Apologize to the child and suggest trying again with a simpler idea, or ask what they'd like to change.`,
          );
        }
      });
  } else {
    // update mode
    const instruction = typeof event.args.instruction === "string" ? event.args.instruction : "";
    if (!instruction) {
      gameDebugWarn("voice", "update_game: missing instruction");
      client?.sendToolResponse(event.id, event.name, {
        ok: false,
        error: "Missing instruction in tool call",
      });
      return;
    }

    if (!current?.codeBundle) {
      gameDebugWarn("voice", "update_game: no existing code to update");
      client?.sendToolResponse(event.id, event.name, {
        ok: false,
        error: "No game code to update. Generate a game first!",
      });
      return;
    }

    const title = typeof event.args.title === "string" ? event.args.title : current.title;

    // Respond immediately so Dodi keeps talking
    client?.sendToolResponse(event.id, event.name, {
      ok: true,
      status: "updating",
    });

    gameDebug("voice", `update_game: requesting update...`);
    set({ creatingGame: { ...current, generating: true, progress: null } });

    // Call coding agent with existing code via SSE
    fetch("/api/agent/task", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        profileId: currentProfileId,
        taskType: "update_game",
        gameId: current.savedGameId ?? undefined,
        payload: {
          instruction,
          existingCode: current.codeBundle,
          existingMarkdown: current.markdown ?? "",
          title,
        },
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Update failed" }));
          if (data.busy) throw new Error("AGENT_BUSY");
          throw new Error(data.error || "Update failed");
        }

        if (!res.body) throw new Error("No response body");
        const outcome = await readProgressStream(res.body, set, get);

        if (outcome.type === "error") {
          throw new Error(outcome.message);
        }

        const result = outcome.result;
        gameDebug("voice", `update_game: received (${result.codeBundle.length} chars, ${result.iterationCount} iterations)`);
        const prev = get().creatingGame;
        const nextIteration = (prev?.iterationCount ?? 0) + 1;
        const newState: CreatingGameState = {
          title: title || result.title || prev?.title || "",
          description: result.description || prev?.description || "",
          subject: result.subject || prev?.subject || "creativity",
          difficulty: result.difficulty || prev?.difficulty || "easy",
          tags: result.tags || prev?.tags || [],
          codeBundle: result.codeBundle,
          markdown: result.markdown || "",
          savedGameId: result.savedGameId ?? prev?.savedGameId ?? null,
          dbSessionId: prev?.dbSessionId ?? null,
          iterationCount: nextIteration,
          generating: false,
          progress: null,
        };
        set({ creatingGame: newState });

        client?.sendContext(
          `[GAME UPDATED] The game has been updated and the child can see the changes now. ` +
          `Tell them the changes are ready! Ask if they like it or want more changes.`,
        );
      })
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : "Update failed";
        gameDebugWarn("voice", `update_game failed: ${errMsg}`);
        const prev = get().creatingGame;
        if (prev) {
          set({ creatingGame: { ...prev, generating: false, progress: null } });
        }
        if (errMsg === "AGENT_BUSY") {
          client?.sendContext(
            `[AGENT BUSY] Still working on the previous request. Tell the child to wait a moment.`,
          );
        } else {
          client?.sendContext(
            `[UPDATE FAILED] The game update failed: ${errMsg}. ` +
            `Let the child know and suggest trying the change again with simpler wording.`,
          );
        }
      });
  }
}

function handleSaveGameToolCall(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
  event: { id: string; name: string; args: Record<string, unknown> },
  profileId: string,
): void {
  const creating = get().creatingGame;

  if (!creating?.codeBundle) {
    gameDebugWarn("voice", "save_game: no code to save");
    client?.sendToolResponse(event.id, event.name, {
      ok: false,
      error: "No game code to save. Generate a game first!",
    });
    return;
  }

  gameDebug("voice", "save_game: saving to library...");

  fetch("/api/games/save-voice-created", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profileId,
      title: creating.title || "My Game",
      description: creating.description,
      subject: creating.subject,
      difficulty: creating.difficulty,
      tags: creating.tags,
      codeBundle: creating.codeBundle,
      markdown: creating.markdown ?? "",
      gameId: creating.savedGameId ?? undefined,
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Save failed" }));
        throw new Error(data.error || "Save failed");
      }
      return res.json();
    })
    .then((data: { game: { id: string }; created: boolean }) => {
      gameDebug("voice", `save_game: saved as ${data.game.id} (created=${data.created})`);
      const current = get().creatingGame;
      if (current) {
        set({ creatingGame: { ...current, savedGameId: data.game.id } });
      }
      client?.sendToolResponse(event.id, event.name, {
        ok: true,
        game_id: data.game.id,
        message: "Game saved to library!",
      });
    })
    .catch((err) => {
      const errMsg = err instanceof Error ? err.message : "Save failed";
      gameDebugWarn("voice", `save_game failed: ${errMsg}`);
      client?.sendToolResponse(event.id, event.name, {
        ok: false,
        error: errMsg,
      });
    });
}

// ---------------------------------------------------------------------------
// Event handler factory
// ---------------------------------------------------------------------------

function createEventHandler(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
  profileId: string,
  generation: number,
  isGameContext: boolean,
  isCreatingContext = false,
): (event: GeminiLiveEvent) => void {
  return (event: GeminiLiveEvent): void => {
    if (generation !== contextGeneration) return;
    if (currentProfileId !== profileId) return;

    switch (event.type) {
      case "setupComplete": {
        // If reconnecting with existing creation state, send current code as context
        if (isCreatingContext) {
          const creating = get().creatingGame;
          if (creating?.codeBundle) {
            client?.sendContext(
              `[CURRENT GAME CODE]\nThe child already has a game in progress. Here is the current code:\n\`\`\`html\n${creating.codeBundle}\n\`\`\`\nIteration: ${creating.iterationCount}`,
            );
          }
        }

        // Try to resume AudioContext without a gesture
        if (streamer) {
          void streamer.tryResume().then((audioOk) => {
            // Guard against stale callback
            if (generation !== contextGeneration) return;
            if (currentProfileId !== profileId) return;

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
        transcript.push({
          role: "dodi",
          text: event.text,
          timestamp: new Date().toISOString(),
        });
        persistToLocalStorage();

        if (isGameContext) {
          turnBuffer += event.text;
        }
        break;

      case "inputTranscription":
        if (!greetingSent) return;
        resetInactivityTimer();
        flushPendingState();
        transcript.push({
          role: "kid",
          text: event.text,
          timestamp: new Date().toISOString(),
        });
        persistToLocalStorage();
        break;

      case "toolCall":
        flushPendingState();
        gameDebug("voice", `Tool call: ${event.name}(${JSON.stringify(event.args)})`);

        if (event.name === "launch_game") {
          // Navigate to a game or filtered game library
          const gameId = typeof event.args.game_id === "string" ? event.args.game_id : "";
          const searchQuery = typeof event.args.search_query === "string" ? event.args.search_query : "";
          const subject = typeof event.args.subject === "string" ? event.args.subject : "";

          let navPath: string;
          let action: string;

          if (gameId) {
            navPath = `/games/${gameId}`;
            action = "navigating_to_game";
          } else if (searchQuery || subject) {
            const params = new URLSearchParams();
            if (searchQuery) params.set("search", searchQuery);
            if (subject) params.set("subject", subject);
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
        } else if (event.name === "create_game") {
          // Navigate to game creation with a plan from the home conversation
          const plan = typeof event.args.plan === "string" ? event.args.plan : "";
          const title = typeof event.args.title === "string" ? event.args.title : "";
          const subject = typeof event.args.subject === "string" ? event.args.subject : "";

          if (!plan) {
            client?.sendToolResponse(event.id, event.name, {
              ok: false,
              error: "Missing plan",
            });
            return;
          }

          pendingGamePlan = { plan, title, subject };
          set({ pendingNavigation: "/games/new" });

          client?.sendToolResponse(event.id, event.name, {
            ok: true,
            action: "navigating_to_game_creator",
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
              return fetch("/api/agent/task", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  profileId,
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
        } else if (event.name === "generate_game" && isCreatingContext) {
          handleCreationToolCall(set, get, event, "generate");
        } else if (event.name === "update_game" && isCreatingContext) {
          handleCreationToolCall(set, get, event, "update");
        } else if (event.name === "save_game" && isCreatingContext) {
          handleSaveGameToolCall(set, get, event, profileId);
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
          error: wasConnected ? "Connection closed unexpectedly" : null,
        });
        break;
      }
    }
  };
}
