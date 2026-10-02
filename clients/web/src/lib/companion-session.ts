/**
 * The browser's companion voice session (`@dodi/client-state`
 * companion-session) over this app's client state, with the Web Audio port,
 * the global WebSocket, localStorage outboxes and page lifecycle events.
 * `@/stores/dodi-session-store` binds it to React.
 */
import { createWebSocketFactory } from "@dodi/ai/voice/voice-socket";
import { createCompanionSession } from "@dodi/client-state/companion-session";
import type { DeviceStorage } from "@dodi/client-state";

import { webAudioPort } from "@/lib/ai/web-audio-port";
import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";

// Resolved per call (never at import): SSR has no localStorage, and every
// caller tolerates a throw.
const webStorage: DeviceStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
};

const INTERACTION_EVENTS = ["click", "touchstart", "keydown"] as const;
const EXIT_EVENTS = ["beforeunload", "pagehide"] as const;

export const companionSession = createCompanionSession({
  api: dodi,
  state: clientState,
  audio: webAudioPort,
  storage: webStorage,
  randomUUID: () => crypto.randomUUID(),
  transport: {
    socket: createWebSocketFactory(),
    fetch: (input, init) => fetch(input, init),
  },
  lifecycle: {
    onExit(handler) {
      for (const type of EXIT_EVENTS) window.addEventListener(type, handler);
      return () => {
        for (const type of EXIT_EVENTS) window.removeEventListener(type, handler);
      };
    },
  },
  interaction: {
    onInteraction(handler) {
      for (const type of INTERACTION_EVENTS) {
        document.addEventListener(type, handler, { capture: true });
      }
      return () => {
        for (const type of INTERACTION_EVENTS) {
          document.removeEventListener(type, handler, { capture: true });
        }
      };
    },
  },
});
