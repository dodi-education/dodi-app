/**
 * The app's companion voice session (`@dodi/client-state` companion-session)
 * over this app's client state (web: lib/companion-session), with the native
 * audio port, the global WebSocket, the SQLite key-value outboxes and the app
 * lifecycle. `@/lib/dodi-session-store` binds it to React.
 *
 * Voice is foreground-only: leaving the foreground flushes the conversation
 * (the exit handler) and ends the session, which frees the microphone. The
 * kid view's auto-connect brings it back once the app is active again.
 */
import { AppState } from "react-native";
import { randomUUID } from "expo-crypto";
import { Storage } from "expo-sqlite/kv-store";
import { createWebSocketFactory } from "@dodi/ai/voice/voice-socket";
import { createCompanionSession } from "@dodi/client-state/companion-session";
import type { DeviceStorage } from "@dodi/client-state";

import { nativeAudioPort } from "@/adapters/audio-port";
import { api, mobilePlatform } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

// The same backing store as mobilePlatform.preferences, so the session's
// per-kid volume and the volume store agree.
const deviceStorage: DeviceStorage = {
  getItem: (key) => Storage.getItemSync(key),
  setItem: (key, value) => Storage.setItemSync(key, value),
  removeItem: (key) => {
    Storage.removeItemSync(key);
  },
};

// Taps anywhere in the kid view keep the companion awake (web: document
// click/touch/key listeners). KidChrome reports them.
const interactionListeners = new Set<() => void>();

/** A tap in the kid view (KidChrome's root reports every touch start). */
export function notifyCompanionInteraction(): void {
  interactionListeners.forEach((listener) => listener());
}

export const companionSession = createCompanionSession({
  api,
  state: clientState,
  audio: nativeAudioPort,
  storage: deviceStorage,
  randomUUID: () => randomUUID(),
  transport: {
    socket: createWebSocketFactory(),
    // Provider requests (e.g. the xAI client secret), never the platform's;
    // those go through `api`.
    fetch: mobilePlatform.fetch,
  },
  lifecycle: {
    onExit(handler) {
      const sub = AppState.addEventListener("change", (next) => {
        // Not "inactive": iOS reports that for the permission prompt and the
        // notification shade too, and the exit handler stops the voice meter.
        if (next === "background") handler();
      });
      return () => sub.remove();
    },
  },
  interaction: {
    onInteraction(handler) {
      interactionListeners.add(handler);
      return () => {
        interactionListeners.delete(handler);
      };
    },
  },
});

// Backgrounded: end the session (mic, sockets, metering); see onExit above
// for why "inactive" does not count.
AppState.addEventListener("change", (next) => {
  if (next !== "background") return;
  const { state, endSession } = companionSession.store.getState();
  if (state !== "disconnected") endSession();
});
