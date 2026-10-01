import { createStore, type StoreApi } from "zustand/vanilla";

/**
 * Single source of truth for connectivity.
 *
 * The platform's own signal (`navigator.onLine`, NetInfo) is trustworthy only
 * when it says offline, so data stores additionally report their fetch
 * outcomes: a network-level failure flips the signal to offline, any
 * successful response flips it back. Consumers: the dodi session guards (no
 * connect attempts offline), offline UI states, connectivity-aware links, and
 * the outbox flush triggers (subscribe to the offline→online edge).
 */
export interface ConnectivityState {
  isOnline: boolean;
  reportOnline: () => void;
  reportOffline: () => void;
}

export type ConnectivityStore = StoreApi<ConnectivityState>;

export function createConnectivityStore(isInitiallyOnline: boolean): ConnectivityStore {
  return createStore<ConnectivityState>()((set) => ({
    isOnline: isInitiallyOnline,
    reportOnline: () => set({ isOnline: true }),
    reportOffline: () => set({ isOnline: false }),
  }));
}

/** Runs `callback` on every offline→online transition. Returns an unsubscribe. */
export function onBackOnline(store: ConnectivityStore, callback: () => void): () => void {
  return store.subscribe((state, previous) => {
    if (state.isOnline && !previous.isOnline) callback();
  });
}
