"use client";

import { useEffect } from "react";

/**
 * Hold a screen wake lock while `active` is true — keeps the device from
 * dimming and locking during long-running client-side work (the game agent's
 * multi-minute build: mobile OSes kill the in-flight provider fetch as soon as
 * the screen locks, surfacing as "Connection error" in error_logs).
 *
 * Best-effort: a silent no-op where the API is unsupported (pre-16.4 iOS
 * Safari) or the request is denied (battery saver). The OS auto-releases the
 * lock when the tab is hidden; we re-acquire on return so a brief app switch
 * doesn't leave the rest of the build unprotected.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let isDisposed = false;

    const acquire = async (): Promise<void> => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (isDisposed) {
          void lock.release();
        } else {
          sentinel = lock;
        }
      } catch {
        // Denied (low battery, browser policy) — keeping the screen on is
        // best-effort; the build itself continues either way.
      }
    };

    const onVisibilityChange = (): void => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void sentinel?.release().catch(() => {});
    };
  }, [active]);
}
