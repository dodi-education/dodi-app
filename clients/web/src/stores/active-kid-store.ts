// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

/** Which kid is active in the kid view, and which profiles were PIN-unlocked. */
export const useActiveKidStore = bindStore(clientState.activeKid);
