/**
 * Per-device, per-session "parent area unlocked" flag.
 *
 * Backed by sessionStorage so it survives same-tab full-document navigation
 * (the kid↔parent switch uses `window.location.assign`) and manual refreshes,
 * but dies when the tab closes — matching "session based per device". The vault
 * store sets it on strong-auth unlock; `ParentPinGate` subscribes for reactivity.
 *
 * This module imports nothing app-side on purpose: `vault-store` depends on it,
 * so it must not depend back (no cycles, no pulling the network-fetching pin
 * store into the widely-imported vault store).
 */
const KEY = "dodi-parent-unlocked";
const listeners = new Set<() => void>();

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

export function isParentUnlocked(): boolean {
  return hasWindow() && window.sessionStorage.getItem(KEY) === "1";
}

export function markParentUnlocked(): void {
  if (!hasWindow()) return;
  window.sessionStorage.setItem(KEY, "1");
  listeners.forEach((listener) => listener());
}

export function clearParentUnlocked(): void {
  if (!hasWindow()) return;
  window.sessionStorage.removeItem(KEY);
  listeners.forEach((listener) => listener());
}

/** Subscribe to lock/unlock changes (for `useSyncExternalStore`). */
export function subscribeParentLock(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
