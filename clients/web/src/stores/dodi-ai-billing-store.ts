// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

/** dodi AI billing snapshot (balance + "as of" timestamps). */
export const useDodiAIBillingStore = bindStore(clientState.dodiAIBilling);
