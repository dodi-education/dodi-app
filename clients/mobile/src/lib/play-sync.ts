/**
 * The app's play/event outbox: shared logic `@dodi/client-state/play-sync`
 * bound to the SQLite key-value store, the platform API and this app's
 * connectivity store (web: lib/games/play-sync). The kid chrome flushes it on
 * entry and on every offline→online transition.
 */
import { randomUUID } from "expo-crypto";
import { Storage } from "expo-sqlite/kv-store";
import { createPlaySync } from "@dodi/client-state/play-sync";

import { api } from "@/adapters/platform";
import { clientState } from "@/lib/client-state";

export const playSync = createPlaySync({
  api,
  storage: {
    getItem: (key) => Storage.getItemSync(key),
    setItem: (key, value) => Storage.setItemSync(key, value),
    removeItem: (key) => {
      Storage.removeItemSync(key);
    },
  },
  connectivity: clientState.connectivity,
  // Hermes has no crypto.randomUUID.
  randomId: () => randomUUID(),
});

export const { startPlay, recordPlayPatch, finalizePlay, logGameEvent, flushPlayOutbox } = playSync;
