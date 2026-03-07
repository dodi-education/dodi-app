import { create } from "zustand";

import {
  GeminiLiveClient,
  type GeminiLiveConfig,
  type GeminiLiveEvent,
  type GeminiLiveToolDeclaration,
} from "@/lib/ai/gemini-live-client";
import { AudioStreamer } from "@/lib/ai/audio-streamer";
import { AudioRecorder } from "@/lib/ai/audio-recorder";
import { extractCommandMarkers } from "@/lib/games/command-markers";
import { gameDebug, gameDebugWarn } from "@/lib/games/debug";
import type { GameAssistantResponse, GameCommand } from "@/types/games";

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

type SessionStatus = "idle" | "connecting" | "connected" | "error";
type WarmState = "cold" | "warming" | "warm_ready" | "active" | "error";

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
}

export interface DodiSessionState {
  // Display
  displayMode: DodiDisplayMode;
  context: DodiContext;

  // Voice session
  status: SessionStatus;
  warmState: WarmState;
  warmReadyAt: string | null;
  dodiSpeaking: boolean;
  micActive: boolean;
  error: string | null;

  // Text chat (for game text mode)
  chatMessages: CompanionMessage[];
  chatSubmitting: boolean;

  // Game command callback
  onRunCommands: ((commands: GameCommand[]) => void) | null;

  // Actions
  setContext: (context: DodiContext, profileId: string) => Promise<void>;
  setDisplayMode: (mode: DodiDisplayMode) => void;
  prewarmSession: (profileId: string) => Promise<void>;
  startSessionFromTap: (profileId: string) => Promise<void>;
  ensureMicAfterGreeting: () => Promise<void>;
  endSession: () => void;
  toggleMic: () => void;
  sendTextMessage: (message: string, gameId?: string) => Promise<void>;
  updateGameState: (state: Record<string, unknown>) => void;
  setOnRunCommands: (handler: ((commands: GameCommand[]) => void) | null) => void;
}

// ---------------------------------------------------------------------------
// External refs (outside Zustand to avoid serialization)
// ---------------------------------------------------------------------------

let client: GeminiLiveClient | null = null;
let streamer: AudioStreamer | null = null;
let recorder: AudioRecorder | null = null;
let abortController: AbortController | null = null;
let warmTimeout: ReturnType<typeof setTimeout> | null = null;

let currentProfileId: string | null = null;
let transcript: TranscriptEntry[] = [];
let sessionStartedAt: string | null = null;
let tapRequested = false;
let greetingSent = false;
let firstTurnCompleteSeen = false;
let micRequestInFlight = false;
let tapStartedAtMs: number | null = null;

// Game voice state refs
let turnBuffer = "";
let lastSentGameState = "";
let stateDebounceTimer: ReturnType<typeof setTimeout> | null = null;

// Context switch generation counter (prevents stale async from applying)
let contextGeneration = 0;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_MEMORY_UPDATE_ENTRIES = 3;
const MIN_BEACON_ENTRIES = 1;
const BEACON_MAX_BYTES = 60000;
const MAX_MESSAGES = 40;
const STATE_DEBOUNCE_MS = 2000;

// ---------------------------------------------------------------------------
// Transcript helpers (ported from voice-session-store)
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

function clearWarmTimeout(): void {
  if (warmTimeout) {
    clearTimeout(warmTimeout);
    warmTimeout = null;
  }
}

function clearStateDebounce(): void {
  if (stateDebounceTimer) {
    clearTimeout(stateDebounceTimer);
    stateDebounceTimer = null;
  }
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

  clearWarmTimeout();
  clearStateDebounce();
  turnBuffer = "";
  lastSentGameState = "";
}

function resetFlowFlags(): void {
  tapRequested = false;
  greetingSent = false;
  firstTurnCompleteSeen = false;
  micRequestInFlight = false;
  tapStartedAtMs = null;
}

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Session activation helper
// ---------------------------------------------------------------------------

function activateSession(set: (partial: Partial<DodiSessionState>) => void): void {
  if (!client || !currentProfileId || greetingSent) return;

  clearWarmTimeout();
  greetingSent = true;
  firstTurnCompleteSeen = false;
  sessionStartedAt = new Date().toISOString();

  window.addEventListener("beforeunload", handleBeforeUnload);
  window.addEventListener("pagehide", handlePageHide);

  set({
    status: "connected",
    warmState: "active",
    warmReadyAt: new Date().toISOString(),
    error: null,
  });

  client.sendGreeting();
}

function scheduleWarmTimeout(profileId: string): void {
  clearWarmTimeout();
  warmTimeout = setTimeout(() => {
    const state = useDodiSessionStore.getState();
    if (
      state.status === "idle" &&
      state.warmState === "warm_ready" &&
      currentProfileId === profileId
    ) {
      // Tear down warm session after 60s idle
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      cleanup();
      resetFlowFlags();
      currentProfileId = null;
      transcript = [];
      sessionStartedAt = null;
      useDodiSessionStore.setState({
        status: "idle",
        warmState: "cold",
        warmReadyAt: null,
        dodiSpeaking: false,
        micActive: false,
        error: null,
      });
    }
  }, 60000);
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

  status: "idle",
  warmState: "cold",
  warmReadyAt: null,
  dodiSpeaking: false,
  micActive: false,
  error: null,

  chatMessages: [],
  chatSubmitting: false,

  onRunCommands: null,

  setDisplayMode: (mode: DodiDisplayMode) => {
    set({ displayMode: mode });
  },

  setOnRunCommands: (handler) => {
    set({ onRunCommands: handler });
  },

  setContext: async (newContext: DodiContext, profileId: string) => {
    const state = get();
    const oldContext = state.context;

    // If same context and same profile, just update gameState if needed
    if (!contextRequiresReconnect(oldContext, newContext)) {
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
    clearWarmTimeout();
    clearStateDebounce();
    turnBuffer = "";
    lastSentGameState = "";

    // Clear game-specific chat messages when entering a new game or leaving game
    set({
      context: newContext,
      status: "connecting",
      warmState: "warming",
      dodiSpeaking: false,
      micActive: false,
      error: null,
      chatMessages: [],
      chatSubmitting: false,
    });

    // Reset flow flags for new connection
    greetingSent = false;
    firstTurnCompleteSeen = false;
    tapRequested = true; // auto-activate since session was already running

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
          set({ status: "error", warmState: "error", error: data.error || "Session failed" });
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
          set({ status: "error", warmState: "error", error: data.error || "Session failed" });
          return;
        }
        config = await res.json();
      }

      if (gen !== contextGeneration || controller.signal.aborted) return;

      if (!streamer) {
        streamer = new AudioStreamer();
      }

      const handleEvent = createEventHandler(set, get, profileId, gen, newContext.type === "game");
      client = new GeminiLiveClient(config, handleEvent);
      client.connect();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (gen !== contextGeneration) return;
      const message = err instanceof Error ? err.message : "Failed to switch context";
      set({ status: "error", warmState: "error", error: message });
    }
  },

  prewarmSession: async (profileId: string) => {
    if (!profileId) return;

    const state = get();
    if (
      currentProfileId === profileId &&
      (state.warmState === "warming" ||
        state.warmState === "warm_ready" ||
        state.warmState === "active")
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
    firstTurnCompleteSeen = false;
    micRequestInFlight = false;

    const gen = ++contextGeneration;
    const controller = new AbortController();
    abortController = controller;

    set({
      status: tapRequested ? "connecting" : "idle",
      warmState: "warming",
      warmReadyAt: null,
      dodiSpeaking: false,
      micActive: false,
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
          const data = await res.json().catch(() => ({ error: "Failed to prewarm session" }));
          const errorMessage = data.error || `Session API returned ${res.status}`;
          set({
            status: tapRequested ? "error" : "idle",
            warmState: "error",
            error: tapRequested ? errorMessage : null,
          });
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
            .catch(() => ({ error: "Failed to prewarm session" }));
          const errorMessage = data.error || `Session API returned ${sessionRes.status}`;
          set({
            status: tapRequested ? "error" : "idle",
            warmState: "error",
            error: tapRequested ? errorMessage : null,
          });
          return;
        }
        config = await sessionRes.json();
      }

      if (gen !== contextGeneration || controller.signal.aborted) return;

      streamer = new AudioStreamer();

      const isGameContext = currentContext.type === "game";
      const handleEvent = createEventHandler(set, get, profileId, gen, isGameContext);
      client = new GeminiLiveClient(config, handleEvent);
      client.connect();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (gen !== contextGeneration) return;
      const message = err instanceof Error ? err.message : "Failed to prewarm session";
      if (tapRequested) {
        tapStartedAtMs = null;
      }
      set({
        status: tapRequested ? "error" : "idle",
        warmState: "error",
        warmReadyAt: null,
        dodiSpeaking: false,
        micActive: false,
        error: tapRequested ? message : null,
      });
    }
  },

  startSessionFromTap: async (profileId: string) => {
    const state = get();
    if (state.status === "connecting" || state.status === "connected") return;
    if (!profileId) return;

    if (currentProfileId && currentProfileId !== profileId) {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("pagehide", handlePageHide);
      cleanup();
      resetFlowFlags();
      currentProfileId = null;
      transcript = [];
      sessionStartedAt = null;
    }

    if (!streamer) {
      streamer = new AudioStreamer();
    }
    streamer.primeFromGesture();

    tapRequested = true;
    tapStartedAtMs = performance.now();

    const latest = get();
    if (
      currentProfileId === profileId &&
      latest.warmState === "warm_ready" &&
      client
    ) {
      activateSession(set);
      return;
    }

    set({
      status: "connecting",
      error: null,
      dodiSpeaking: false,
      micActive: false,
    });

    if (currentProfileId === profileId && latest.warmState === "warming") {
      return;
    }

    void get().prewarmSession(profileId);
  },

  ensureMicAfterGreeting: async () => {
    if (get().status !== "connected") return;
    if (get().micActive || micRequestInFlight) return;
    if (!currentProfileId) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      set({ error: "secureContextRequired", micActive: false });
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

      if (get().status !== "connected") {
        for (const track of micStream.getTracks()) track.stop();
        return;
      }

      recorder?.stop();
      const rec = new AudioRecorder((base64Pcm: string) => {
        client?.sendAudio(base64Pcm);
      });
      recorder = rec;
      await rec.startWithStream(micStream);
      set({ micActive: true, error: null });
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        set({ micActive: false, error: "micPermissionNeeded" });
      } else {
        const message = err instanceof Error ? err.message : "Microphone unavailable";
        set({ micActive: false, error: message });
      }
    } finally {
      micRequestInFlight = false;
    }
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

    cleanup();
    resetFlowFlags();

    set({
      status: "idle",
      warmState: "cold",
      warmReadyAt: null,
      dodiSpeaking: false,
      micActive: false,
      error: null,
      chatMessages: [],
      chatSubmitting: false,
    });
  },

  toggleMic: () => {
    const { micActive } = get();
    if (micActive) {
      recorder?.stop();
      recorder = null;
      set({ micActive: false });
    } else {
      void get().ensureMicAfterGreeting();
    }
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

  updateGameState: (state: Record<string, unknown>) => {
    const current = get();
    if (current.context.type !== "game") return;

    // Update context with new game state
    set({
      context: { ...current.context, gameState: state },
    });

    // Debounced sendContext for voice sessions
    if (!client || current.status !== "connected") return;

    const stateJson = JSON.stringify(state);
    if (stateJson === lastSentGameState) return;

    clearStateDebounce();
    stateDebounceTimer = setTimeout(() => {
      lastSentGameState = stateJson;
      gameDebug("voice", `Sending game state update (${stateJson.length} chars)`);
      client?.sendContext(`[GAME STATE UPDATE]\n${stateJson}`);
      stateDebounceTimer = null;
    }, STATE_DEBOUNCE_MS);
  },
}));

// ---------------------------------------------------------------------------
// Event handler factory
// ---------------------------------------------------------------------------

function createEventHandler(
  set: (partial: Partial<DodiSessionState>) => void,
  get: () => DodiSessionState,
  profileId: string,
  generation: number,
  isGameContext: boolean,
): (event: GeminiLiveEvent) => void {
  return (event: GeminiLiveEvent): void => {
    if (generation !== contextGeneration) return;
    if (currentProfileId !== profileId) return;

    switch (event.type) {
      case "setupComplete":
        if (tapRequested) {
          activateSession(set);
        } else {
          set({
            status: "idle",
            warmState: "warm_ready",
            warmReadyAt: new Date().toISOString(),
            error: null,
          });
          scheduleWarmTimeout(profileId);
        }
        break;

      case "audio":
        if (!greetingSent) return;
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
        transcript.push({
          role: "kid",
          text: event.text,
          timestamp: new Date().toISOString(),
        });
        persistToLocalStorage();
        break;

      case "toolCall":
        if (!isGameContext) return;

        gameDebug("voice", `Tool call: ${event.name}(${JSON.stringify(event.args)})`);

        if (event.name === "execute_game_command") {
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

          client?.sendToolResponse(event.id, event.name, {
            ok: true,
            command: commandType,
          });
        } else {
          gameDebugWarn("voice", `Unknown tool: ${event.name}`);
          client?.sendToolResponse(event.id, event.name, {
            ok: false,
            error: `Unknown tool: ${event.name}`,
          });
        }
        break;

      case "turnComplete":
        if (!greetingSent) return;
        set({ dodiSpeaking: false });
        streamer?.resume();

        if (!firstTurnCompleteSeen) {
          firstTurnCompleteSeen = true;
          void get().ensureMicAfterGreeting();
        }

        // Process turn buffer for game context (extract commands from text markers)
        if (isGameContext) {
          const text = turnBuffer.trim();
          turnBuffer = "";

          if (text) {
            const { cleanedText, commands } = extractCommandMarkers(text);

            if (cleanedText) {
              const msgs = [...get().chatMessages];
              msgs.push({ id: createMessageId(), role: "dodi", text: cleanedText });
              set({ chatMessages: msgs.slice(-MAX_MESSAGES) });
            }

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

      case "interrupted":
        if (!greetingSent) return;
        set({ dodiSpeaking: false });
        streamer?.stop();
        break;

      case "error": {
        const wasActive =
          tapRequested ||
          get().status === "connecting" ||
          get().status === "connected" ||
          get().warmState === "active";
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.removeEventListener("pagehide", handlePageHide);
        cleanup();
        resetFlowFlags();
        set({
          status: wasActive ? "error" : "idle",
          warmState: "error",
          warmReadyAt: null,
          dodiSpeaking: false,
          micActive: false,
          error: wasActive ? event.error : null,
        });
        break;
      }

      case "closed": {
        const wasActive =
          get().status === "connecting" ||
          get().status === "connected" ||
          get().warmState === "active";
        window.removeEventListener("beforeunload", handleBeforeUnload);
        window.removeEventListener("pagehide", handlePageHide);
        cleanup();
        resetFlowFlags();
        set({
          status: wasActive ? "error" : "idle",
          warmState: wasActive ? "error" : "cold",
          warmReadyAt: null,
          dodiSpeaking: false,
          micActive: false,
          error: wasActive ? "Connection closed unexpectedly" : null,
        });
        break;
      }
    }
  };
}
