// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

export type { VaultStatus } from "@dodi/client-state";

/** Client vault orchestration: the in-memory VaultSession and the unlock flows. */
export const useVaultStore = bindStore(clientState.vault);
