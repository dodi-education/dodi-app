/**
 * The browser's play/event outbox: shared logic `@dodi/client-state/play-sync`
 * bound to localStorage, the platform API and this app's connectivity store.
 * The app-facing names stay unchanged.
 */
import {
  createPlaySync,
  type GameEventOutboxEntry,
  type PlayOutboxEntry,
} from "@dodi/client-state/play-sync";

import { dodi } from "@/lib/api";
import { clientState } from "@/lib/client-state";

export type { GameEventOutboxEntry, PlayOutboxEntry };

const playSync = createPlaySync({
  // Resolved per call, so tests can swap the transport and storage.
  api: { request: (path, init) => dodi.request(path, init) },
  storage: {
    getItem: (key) => localStorage.getItem(key),
    setItem: (key, value) => localStorage.setItem(key, value),
    removeItem: (key) => localStorage.removeItem(key),
  },
  connectivity: clientState.connectivity,
  randomId: () => crypto.randomUUID(),
});

export const {
  startPlay,
  recordPlayPatch,
  finalizePlay,
  logGameEvent,
  flushPlayOutbox,
  _resetForTests,
} = playSync;
