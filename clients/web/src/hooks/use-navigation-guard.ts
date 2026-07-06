"use client";

import { useEffect } from "react";

/**
 * Warn before an action that would leave the current page while `active`.
 *
 * The game-studio agent loop runs inside the browser tab, so closing/reloading
 * the tab or navigating away mid-build silently kills generation. This guard:
 *  - triggers the native "Leave site?" prompt on tab close / reload (beforeunload)
 *  - intercepts in-app link clicks and browser back/forward (App Router has no
 *    built-in route-change guard) with a confirm
 *
 * The guard is fully removed when `active` flips false, so normal navigation is
 * never affected outside an in-flight build.
 */
export function useNavigationGuard(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      e.preventDefault();
      // Legacy browsers require a returnValue to show the native prompt.
      e.returnValue = "";
    };

    const onClickCapture = (e: MouseEvent): void => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onPopState = (): void => {
      if (!window.confirm(message)) {
        // Cancel the back/forward by re-pushing the current entry.
        history.pushState(null, "", window.location.href);
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    // Seed a history entry so the first Back triggers a catchable popstate.
    history.pushState(null, "", window.location.href);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [active, message]);
}
