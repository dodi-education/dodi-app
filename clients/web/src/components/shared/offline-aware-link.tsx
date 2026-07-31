"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";

import { isCurrentlyOnline } from "@/stores/connectivity-store";

/**
 * `next/link` that falls back to a full-page load while offline: a soft
 * navigation would fail on its RSC flight fetch, while a full load is served
 * from the service worker's HTML shell cache (see public/sw.js). Drop-in for
 * kid-view links to SW-cached routes.
 */
export function OfflineAwareLink({
  onClick,
  href,
  ...props
}: ComponentProps<typeof Link>) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // Modified clicks (open-in-new-tab, etc.) keep their native behavior.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    if (isCurrentlyOnline()) return;
    e.preventDefault();
    window.location.assign(
      typeof href === "string" ? href : (href.pathname ?? "/"),
    );
  }

  return <Link href={href} {...props} onClick={handleClick} />;
}
