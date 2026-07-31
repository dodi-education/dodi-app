"use client";

import { useSyncExternalStore } from "react";

import { useConnectivityStore } from "@/stores/connectivity-store";

/**
 * Reactive connectivity for components. The server snapshot is always `true`
 * (SSR markup never renders the offline state); the client corrects after
 * hydration if it is actually offline.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => useConnectivityStore.subscribe(onStoreChange),
    () => useConnectivityStore.getState().isOnline,
    () => true,
  );
}
