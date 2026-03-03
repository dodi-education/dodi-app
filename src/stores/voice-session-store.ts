import { create } from "zustand";

import {
  GeminiLiveClient,
  type GeminiLiveConfig,
  type GeminiLiveEvent,
} from "@/lib/ai/gemini-live-client";
import { AudioStreamer } from "@/lib/ai/audio-streamer";
import { AudioRecorder } from "@/lib/ai/audio-recorder";

type SessionStatus = "idle" | "connecting" | "connected" | "error";

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
  dodiSpeaking: boolean;
  micActive: boolean;
  error: string | null;

  startSession: (profileId: string) => Promise<void>;
  endSession: () => void;
  toggleMic: () => void;
}

// Store references outside Zustand to avoid serialization issues
let client: GeminiLiveClient | null = null;
let streamer: AudioStreamer | null = null;
let recorder: AudioRecorder | null = null;
let abortController: AbortController | null = null;

// Transcript state (kept outside Zustand — not needed for UI rendering)
let currentProfileId: string | null = null;
let transcript: TranscriptEntry[] = [];
let sessionStartedAt: string | null = null;

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
}

export const useVoiceSessionStore = create<VoiceSessionState>((set, get) => ({
  status: "idle",
  dodiSpeaking: false,
  micActive: false,
  error: null,

  startSession: async (profileId: string) => {
    // Clean up any existing session
    cleanup();
    window.removeEventListener("beforeunload", handleBeforeUnload);
    window.removeEventListener("pagehide", handlePageHide);

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

    // Reset transcript state
    currentProfileId = profileId;
    transcript = [];
    sessionStartedAt = new Date().toISOString();

    set({ status: "connecting", error: null, dodiSpeaking: false, micActive: false });

    const controller = new AbortController();
    abortController = controller;

    try {
      // navigator.mediaDevices requires a secure context (HTTPS or localhost)
      if (!navigator.mediaDevices?.getUserMedia) {
        set({
          status: "error",
          error: "secureContextRequired",
        });
        return;
      }

      // Request mic permission AND fetch session config in parallel.
      // getUserMedia MUST be called synchronously within the user gesture
      // (click handler) — if we await the fetch first, the gesture context is lost.
      const [micStream, sessionRes] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          },
        }),
        fetch("/api/ai/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId }),
          signal: controller.signal,
        }),
      ]);

      if (controller.signal.aborted) {
        // Clean up the mic stream if aborted
        for (const track of micStream.getTracks()) track.stop();
        return;
      }

      if (!sessionRes.ok) {
        for (const track of micStream.getTracks()) track.stop();
        const data = await sessionRes.json().catch(() => ({ error: "Failed to start session" }));
        set({ status: "error", error: data.error || `Session API returned ${sessionRes.status}` });
        return;
      }

      const config: GeminiLiveConfig & { language: string } = await sessionRes.json();

      if (controller.signal.aborted) {
        for (const track of micStream.getTracks()) track.stop();
        return;
      }

      // Register page lifecycle handlers for crash resilience
      window.addEventListener("beforeunload", handleBeforeUnload);
      window.addEventListener("pagehide", handlePageHide);

      // Create audio streamer for playback
      streamer = new AudioStreamer();

      // Create recorder with the already-acquired mic stream
      recorder = new AudioRecorder((base64Pcm: string) => {
        client?.sendAudio(base64Pcm);
      });
      await recorder.startWithStream(micStream);
      if (!controller.signal.aborted) {
        set({ micActive: true });
      }

      // Create the WebSocket client
      const handleEvent = (event: GeminiLiveEvent): void => {
        if (controller.signal.aborted) return;

        switch (event.type) {
          case "setupComplete":
            set({ status: "connected" });
            client?.sendGreeting();
            break;

          case "audio":
            set({ dodiSpeaking: true });
            streamer?.addPcmChunk(event.data);
            break;

          case "text":
            // Dodi's speech as text — capture for transcript
            transcript.push({
              role: "dodi",
              text: event.text,
              timestamp: new Date().toISOString(),
            });
            persistToLocalStorage();
            break;

          case "inputTranscription":
            // Kid's speech transcribed by Gemini
            transcript.push({
              role: "kid",
              text: event.text,
              timestamp: new Date().toISOString(),
            });
            persistToLocalStorage();
            break;

          case "turnComplete":
            set({ dodiSpeaking: false });
            streamer?.resume();
            break;

          case "interrupted":
            set({ dodiSpeaking: false });
            streamer?.stop();
            break;

          case "error":
            set({ status: "error", error: event.error });
            break;

          case "closed":
            if (get().status === "connected" || get().status === "connecting") {
              set({ status: "error", error: "Connection closed unexpectedly" });
            }
            break;
        }
      };

      client = new GeminiLiveClient(config, handleEvent);
      client.connect();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Failed to connect";
      // Map NotAllowedError to a friendlier key
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        set({ status: "error", error: "micPermissionNeeded" });
      } else {
        set({ status: "error", error: message });
      }
    }
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

    set({
      status: "idle",
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
      // Re-request mic — this is from a click handler so gesture context is valid
      const rec = new AudioRecorder((base64Pcm: string) => {
        client?.sendAudio(base64Pcm);
      });
      recorder = rec;
      rec.start()
        .then(() => {
          useVoiceSessionStore.setState({ micActive: true });
        })
        .catch(() => {
          useVoiceSessionStore.setState({ micActive: false });
        });
    }
  },
}));
