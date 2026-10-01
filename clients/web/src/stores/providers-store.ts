// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

/** E2EE provider API keys: decrypted in memory, re-sealed on every change. */
export const useProvidersStore = bindStore(clientState.providers);
