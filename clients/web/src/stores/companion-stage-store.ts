// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

/** The companion on screen: the Playground and trick requests. */
export const useCompanionStageStore = bindStore(clientState.companionStage);
