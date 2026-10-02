import type { View } from "react-native";
import type { SnapshotFlashRect } from "@dodi/ui-recipes";

/**
 * Where the kid nav's items sit on screen (web: the `[data-kid-nav="…"]`
 * attributes the snapshot flash queries). The kid chrome registers each item's
 * view and re-measures it on every layout; readers ask for a fresh window
 * rect (measureInWindow) and fall back to the last one measured.
 */
interface NavItemEntry {
  view: View | null;
  rect: SnapshotFlashRect | null;
}

const items = new Map<string, NavItemEntry>();

function entry(href: string): NavItemEntry {
  let found = items.get(href);
  if (!found) {
    found = { view: null, rect: null };
    items.set(href, found);
  }
  return found;
}

function measure(view: View): Promise<SnapshotFlashRect | null> {
  return new Promise((resolve) => {
    view.measureInWindow((left, top, width, height) => {
      // A detached or not-yet-laid-out view measures as zeros.
      resolve(width > 0 && height > 0 ? { left, top, width, height } : null);
    });
  });
}

/** The nav item's view (a ref callback: `null` on unmount, so no nav means no rect). */
export function registerKidNavItem(href: string, view: View | null): void {
  entry(href).view = view;
}

/** Re-measures the item after a layout change (its onLayout). */
export function remeasureKidNavItem(href: string): void {
  const item = entry(href);
  const view = item.view;
  if (!view) return;
  void measure(view).then((rect) => {
    if (rect && item.view === view) item.rect = rect;
  });
}

/** The item's current window rect, or `null` when no kid nav is mounted. */
export async function measureKidNavItem(href: string): Promise<SnapshotFlashRect | null> {
  const item = items.get(href);
  if (!item?.view) return null;
  return (await measure(item.view)) ?? item.rect;
}
