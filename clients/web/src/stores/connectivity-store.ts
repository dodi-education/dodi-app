import { create } from "zustand";

/**
 * Single source of truth for connectivity.
 *
 * `navigator.onLine === false` is trustworthy ("definitely offline") but
 * `true` only means "maybe online" — so data stores additionally report their
 * fetch outcomes: a network-level failure flips the signal to offline, any
 * successful response flips it back. Consumers: the Dodi session guards (no
 * connect attempts offline), offline UI states, connectivity-aware links, and
 * the outbox flush triggers (subscribe to the offline→online edge).
 */
interface ConnectivityState {
  isOnline: boolean;
  reportOnline: () => void;
  reportOffline: () => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  // Only an explicit `false` means offline — node (tests/SSR) has a navigator
  // without `onLine`, and "no signal" must default to online.
  isOnline: typeof navigator === "undefined" || navigator.onLine !== false,
  reportOnline: () => set({ isOnline: true }),
  reportOffline: () => set({ isOnline: false }),
}));

/** Snapshot read for non-React callers (stores, sync modules). */
export function isCurrentlyOnline(): boolean {
  return useConnectivityStore.getState().isOnline;
}

/**
 * Runs `callback` on every offline→online transition (and the browser
 * `online` event). Returns an unsubscribe function.
 */
export function onBackOnline(callback: () => void): () => void {
  return useConnectivityStore.subscribe((state, previous) => {
    if (state.isOnline && !previous.isOnline) callback();
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () =>
    useConnectivityStore.getState().reportOnline(),
  );
  window.addEventListener("offline", () =>
    useConnectivityStore.getState().reportOffline(),
  );
}
