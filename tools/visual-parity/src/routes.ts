/**
 * Which screens to compare: every feature marked `mobile: done` in
 * features.yaml, at the web route its page file defines. Dynamic routes
 * ([id]) are skipped; they need data the tool doesn't create.
 */
import type { Feature } from "../../parity/src/check";

/** `clients/web/src/app/(auth)/login/page.tsx` → `/login`; null when not a static page. */
export function webRouteOf(path: string): string | null {
  const m = path.match(/^clients\/web\/src\/app\/(.*)page\.tsx$/);
  if (!m) return null;
  const segments = m[1]
    .split("/")
    .filter(Boolean)
    .filter((s) => !/^\(.*\)$/.test(s));
  if (segments.some((s) => s.startsWith("["))) return null;
  return `/${segments.join("/")}`;
}

/** Screens a signed-out visitor can see; everything else needs the test account. */
const PUBLIC_ROUTES = new Set(["/login", "/register", "/reset-password"]);

export interface ScreenTarget {
  featureId: string;
  route: string;
  /** Signed-in parent area (needs the test account) vs public (auth pages). */
  isSignedIn: boolean;
}

export function screenTargets(features: Feature[]): ScreenTarget[] {
  const targets: ScreenTarget[] = [];
  for (const feature of features) {
    if (feature.mobile !== "done") continue;
    for (const path of feature.web_paths ?? []) {
      const route = webRouteOf(path);
      // The settings index only redirects; its first tab is captured anyway.
      if (!route || route === "/parent/settings") continue;
      targets.push({ featureId: feature.id, route, isSignedIn: !PUBLIC_ROUTES.has(route) });
    }
  }
  return targets;
}

/** File name for a route's screenshot (`/parent/settings/general` → `parent__settings__general`). */
export function slugOf(route: string): string {
  return route.replace(/^\//, "").replace(/\//g, "__") || "root";
}
