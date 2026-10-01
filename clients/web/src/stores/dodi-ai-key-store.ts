// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

export type { DodiAIKeyStatus } from "@dodi/client-state";

/** dodi AI inference keys — session credentials, MEMORY ONLY. */
export const useDodiAIKeyStore = bindStore(clientState.dodiAIKeys);
