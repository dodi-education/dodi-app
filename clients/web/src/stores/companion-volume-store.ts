// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

import { readKidVolume as readPersistedVolume } from "@dodi/client-state";

/** Per-kid companion output volume (a device preference). */
export const useCompanionVolumeStore = bindStore(clientState.companionVolume);

/** The persisted level for a kid (default 1). */
export function readKidVolume(kidId: string): number {
  return readPersistedVolume(
    {
      getItem: (key) => (typeof window === "undefined" ? null : window.localStorage.getItem(key)),
      setItem: () => {},
    },
    kidId,
  );
}
