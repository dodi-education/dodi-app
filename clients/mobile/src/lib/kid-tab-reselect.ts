/**
 * Re-tapping the kid nav tab you're already on resets that section (web: the
 * `kid-tab-reselect` window event from kid-chrome). Sections subscribe with
 * their root href (`/games`, `/friends`, …).
 */
type Listener = (href: string) => void;

const listeners = new Set<Listener>();

export function emitKidTabReselect(href: string): void {
  listeners.forEach((listener) => listener(href));
}

/** Subscribe; returns the unsubscribe. */
export function onKidTabReselect(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
