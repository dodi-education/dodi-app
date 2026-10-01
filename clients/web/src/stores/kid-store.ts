// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

/** Decrypt-once kid cache (ciphertext also written through for offline use). */
export const useKidStore = bindStore(clientState.kids);
