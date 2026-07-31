"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker (public/sw.js). Gated off in dev unless
 * NEXT_PUBLIC_ENABLE_SW=1 — a stale worker serving cached shells makes dev
 * hot-reload debugging miserable.
 */
export function RegisterServiceWorker(): null {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.NEXT_PUBLIC_ENABLE_SW !== "1"
    ) {
      return;
    }
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is progressive enhancement; never surface a failure.
    });
  }, []);

  return null;
}
