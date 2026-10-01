// Shared logic: @dodi/client-state. This module binds the browser instance
// (lib/client-state.ts) to React and keeps the app-facing names.
import { bindStore } from "@dodi/client-state/react";

import { clientState } from "@/lib/client-state";

import { onBackOnline as onConnectivityBackOnline } from "@dodi/client-state";

/** Single source of truth for connectivity (data stores report fetch outcomes). */
export const useConnectivityStore = bindStore(clientState.connectivity);

/** Snapshot read for non-React callers (stores, sync modules). */
export function isCurrentlyOnline(): boolean {
  return clientState.connectivity.getState().isOnline;
}

/** Runs `callback` on every offline→online transition. Returns an unsubscribe. */
export function onBackOnline(callback: () => void): () => void {
  return onConnectivityBackOnline(clientState.connectivity, callback);
}
