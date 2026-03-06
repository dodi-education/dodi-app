import { create } from "zustand";

import {
  GeminiLiveClient,
  type GeminiLiveConfig,
  type GeminiLiveEvent,
} from "@/lib/ai/gemini-live-client";
import { AudioStreamer } from "@/lib/ai/audio-streamer";
import { AudioRecorder } from "@/lib/ai/audio-recorder";

type SessionStatus = "idle" | "connecting" | "connected" | "error";
type WarmState = "cold" | "warming" | "warm_ready" | "active" | "error";

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

interface VoiceSessionState {
  status: SessionStatus;
  warmState: WarmState;
  warmReadyAt: string | null;
  dodiSpeaking: boolean;
  micActive: boolean;
  error: string | null;

  prewarmSession: (profileId: string) => Promise<void>;
  startSessionFromTap: (profileId: string) => Promise<void>;
  ensureMicAfterGreeting: () => Promise<void>;
  teardownWarmSession: () => void;
  endSession: () => void;
  toggleMic: () => void;
}

// Store references outside Zustand to avoid serialization issues
let client: GeminiLiveClient | null = null;
let streamer: AudioStreamer | null = null;
let recorder: AudioRecorder | null = null;
let abortController: AbortController | null = null;
let warmTimeout: ReturnType<typeof setTimeout> | null = null;

// Transcript state (kept outside Zustand — not needed for UI rendering)
let currentProfileId: string | null = null;
let transcript: TranscriptEntry[] = [];
let sessionStartedAt: string | null = null;
let tapRequested = false;
let greetingSent = false;
let firstTurnCompleteSeen = false;
let micRequestInFlight = false;
let tapStartedAtMs: number | null = null;

// Normal session end requires substantive conversation for AI processing
const MIN_MEMORY_UPDATE_ENTRIES = 3;
// Beacon/recovery paths save anything — even 1 entry is worth preserving on crash
const MIN_BEACON_ENTRIES = 1;
const BEACON_MAX_BYTES = 60000; // ~60KB, leaving headroom under 64KB browser limit

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

// --- localStorage helpers ---

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
    // localStorage may be unavailable or full — ignore
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

// --- Beacon helper ---

/**
 * Read localStorage, clear it, send transcript to the learning endpoint via
 * sendBeacon. If the beacon fails to queue, restore localStorage so the data
 * survives for recovery on next app load.
 */
function sendTranscriptBeacon(): void {
  if (!currentProfileId) return;

  const stored = readLocalStorage(currentProfileId);
  if (!stored || stored.entries.length < MIN_BEACON_ENTRIES) return;

  const formatted = formatTranscript(stored.entries);
  const payload = JSON.stringify({
    profileId: stored.profileId,
    sessionTranscript: formatted,
  });

  // Truncate if payload exceeds sendBeacon size limit
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

  // Clear localStorage BEFORE beacon — minimises double-processing
  clearLocalStorage(currentProfileId);

  try {
    const blob = new Blob([finalPayload], { type: "application/json" });
    const sent = navigator.sendBeacon("/api/ai/memory-update", blob);
    if (!sent) {
      // Beacon failed to queue — restore so next session start can recover
      persistToLocalStorageRaw(currentProfileId, stored);
    }
  } catch {
    // Restore on any error
    persistToLocalStorageRaw(currentProfileId, stored);
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

// --- Page lifecycle handlers ---

function handleBeforeUnload(): void {
  sendTranscriptBeacon();
}

function handlePageHide(): void {
  sendTranscriptBeacon();
}

// --- Resource cleanup ---

function clearWarmTimeout(): void {
  if (warmTimeout) {
    clearTimeout(warmTimeout);
    warmTimeout = null;
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
}

function resetFlowFlags(): void {
  tapRequested = false;
  greetingSent = false;
  firstTurnCompleteSeen = false;
  micRequestInFlight = false;
  tapStartedAtMs = null;
}

function scheduleWarmTimeout(profileId: string): void {
  clearWarmTimeout();
  warmTimeout = setTimeout(() => {
    const state = useVoiceSessionStore.getState();
    if (
      state.status === "idle" &&
      state.warmState === "warm_ready" &&
      currentProfileId === profileId
    ) {
      state.teardownWarmSession();
    }
  }, 60000);
}

function activateWarmSession(set: (partial: Partial<VoiceSessionState>) => void): void {
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

export const useVoiceSessionStore = create<VoiceSessionState>((set, get) => ({
  status: "idle",
  warmState: "cold",
  warmReadyAt: null,
  dodiSpeaking: false,
  micActive: false,
  error: null,

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
      get().teardownWarmSession();
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
      const sessionRes = await fetch("/api/ai/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId }),
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

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

      const config: GeminiLiveConfig & { language: string } = await sessionRes.json();
      if (controller.signal.aborted) return;

      streamer = new AudioStreamer();

      const handleEvent = (event: GeminiLiveEvent): void => {
        if (controller.signal.aborted) return;
        if (currentProfileId !== profileId) return;

        switch (event.type) {
          case "setupComplete":
            if (tapRequested) {
              activateWarmSession(set);
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

          case "turnComplete":
            if (!greetingSent) return;
            set({ dodiSpeaking: false });
            streamer?.resume();
            if (!firstTurnCompleteSeen) {
              firstTurnCompleteSeen = true;
              void get().ensureMicAfterGreeting();
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

      client = new GeminiLiveClient(config, handleEvent);
      client.connect();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
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
      get().teardownWarmSession();
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
      activateWarmSession(set);
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

  teardownWarmSession: () => {
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("pagehide", handlePageHide);

    cleanup();
    resetFlowFlags();
    currentProfileId = null;
    transcript = [];
    sessionStartedAt = null;

    set({
      status: "idle",
      warmState: "cold",
      warmReadyAt: null,
      dodiSpeaking: false,
      micActive: false,
      error: null,
    });
  },

  endSession: () => {
    // Unregister page lifecycle handlers
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("pagehide", handlePageHide);

    const pid = currentProfileId;

    // Fire memory update if we have enough transcript for AI processing
    if (pid && transcript.length >= MIN_MEMORY_UPDATE_ENTRIES) {
      const formatted = formatTranscript(transcript);

      // Fire-and-forget — don't block the UI
      fetch("/api/ai/memory-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: pid,
          sessionTranscript: formatted,
        }),
      }).catch(() => {
        // Memory update failure is non-critical
      });
    }

    // Clear localStorage — session ended normally, no recovery needed
    if (pid) {
      clearLocalStorage(pid);
    }

    // Reset transcript state
    currentProfileId = null;
    transcript = [];
    sessionStartedAt = null;

    // Clean up resources
    cleanup();
    resetFlowFlags();

    set({
      status: "idle",
      warmState: "cold",
      warmReadyAt: null,
      dodiSpeaking: false,
      micActive: false,
      error: null,
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
}));
