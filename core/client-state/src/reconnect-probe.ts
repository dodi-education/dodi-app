/**
 * Noticing that the network is back, for platforms without a trustworthy
 * "online" event (the app; the web has `window.online`). While the
 * connectivity store says offline, a cheap request goes out on an interval and
 * whenever the platform asks (the app returning to the foreground); the first
 * one the network answers, with any HTTP status, flips the store back online,
 * which fires the outbox flushes and the offline warm-up (`onBackOnline`).
 */
import type { ConnectivityStore } from "./connectivity-store";

/** How often an offline device checks for the network. */
export const RECONNECT_PROBE_INTERVAL_MS = 15_000;

export interface ReconnectProbeDeps {
  connectivity: ConnectivityStore;
  /** One cheap request: resolves when the network answered, rejects on a network failure. */
  probe: () => Promise<unknown>;
  intervalMs?: number;
}

export interface ReconnectProbe {
  /** Probe now when offline (e.g. the app came back to the foreground). */
  check(): void;
  stop(): void;
}

export function startReconnectProbe({
  connectivity,
  probe,
  intervalMs = RECONNECT_PROBE_INTERVAL_MS,
}: ReconnectProbeDeps): ReconnectProbe {
  let timer: ReturnType<typeof setInterval> | null = null;
  let isProbing = false;

  function check(): void {
    if (connectivity.getState().isOnline || isProbing) return;
    isProbing = true;
    probe()
      .then(
        () => connectivity.getState().reportOnline(),
        () => {},
      )
      .finally(() => {
        isProbing = false;
      });
  }

  function sync(isOnline: boolean): void {
    if (isOnline && timer) {
      clearInterval(timer);
      timer = null;
    } else if (!isOnline && !timer) {
      timer = setInterval(check, intervalMs);
    }
  }

  sync(connectivity.getState().isOnline);
  const unsubscribe = connectivity.subscribe((state, previous) => {
    if (state.isOnline !== previous.isOnline) sync(state.isOnline);
  });

  return {
    check,
    stop() {
      unsubscribe();
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
