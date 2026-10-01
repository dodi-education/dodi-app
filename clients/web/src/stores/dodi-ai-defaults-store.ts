// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

/** The dodi AI per-category recommendations (platform_config, non-secret). */
export const useDodiAIDefaultsStore = bindStore(clientState.dodiAIDefaults);
