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

const CHECKPOINT_STORAGE_KEY = "dodi-transcript-checkpoint";
const MIN_TRANSCRIPT_ENTRIES = 3;
const BEACON_MAX_BYTES = 60000; // ~60KB, leaving headroom under 64KB browser limit

function formatTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map(
      (e) =>
        `[${e.timestamp}] ${e.role === "dodi" ? "Dodi" : "Kid"}: ${e.text}`,
    )
    .join("\n");
}

function mirrorToSessionStorage(): void {
  try {
    sessionStorage.setItem(
      CHECKPOINT_STORAGE_KEY,
      JSON.stringify({
        profileId: currentProfileId,
        transcript,
        sessionStartedAt,
      }),
    );
  } catch {
    // sessionStorage may be unavailable or full — ignore
  }
}

function clearSessionStorage(): void {
  try {
    sessionStorage.removeItem(CHECKPOINT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function handleBeforeUnload(): void {
  if (!currentProfileId || transcript.length < MIN_TRANSCRIPT_ENTRIES) return;

  const formatted = formatTranscript(transcript);
  const payload = JSON.stringify({
    profileId: currentProfileId,
    transcript: formatted,
    sessionStartedAt,
  });

  // Truncate if payload is too large for sendBeacon
  let finalPayload = payload;
  if (new Blob([payload]).size > BEACON_MAX_BYTES) {
    // Keep the most recent entries that fit
    const entries = [...transcript];
    while (entries.length > MIN_TRANSCRIPT_ENTRIES) {
      entries.shift();
      const truncated = JSON.stringify({
        profileId: currentProfileId,
        transcript: formatTranscript(entries),
        sessionStartedAt,
      });
      if (new Blob([truncated]).size <= BEACON_MAX_BYTES) {
        finalPayload = truncated;
        break;
      }
    }
  }

  navigator.sendBeacon("/api/ai/transcript-checkpoint", finalPayload);
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

    // Reset transcript state
    currentProfileId = profileId;
    transcript = [];
    sessionStartedAt = new Date().toISOString();
    clearSessionStorage();

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

      // Register beforeunload for crash resilience
      window.addEventListener("beforeunload", handleBeforeUnload);

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
            mirrorToSessionStorage();
            break;

          case "inputTranscription":
            // Kid's speech transcribed by Gemini
            transcript.push({
              role: "kid",
              text: event.text,
              timestamp: new Date().toISOString(),
            });
            mirrorToSessionStorage();
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
    // Unregister beforeunload
    window.removeEventListener("beforeunload", handleBeforeUnload);
    clearSessionStorage();

    // Fire memory update if we have enough transcript
    if (currentProfileId && transcript.length >= MIN_TRANSCRIPT_ENTRIES) {
      const formatted = formatTranscript(transcript);
      const pid = currentProfileId;

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
