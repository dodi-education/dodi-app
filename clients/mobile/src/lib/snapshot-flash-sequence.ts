import { snapshotFlash } from "@dodi/ui-recipes";

/**
 * Extra time past fly + hold + fade before the safety timeout ends a flash
 * whose fade never reported its end, so a flash can't get stuck on screen.
 */
export const SNAPSHOT_FLASH_SAFETY_MARGIN_MS = 1000;

/** Why a flash ended. */
export type SnapshotFlashEnd = "faded" | "safety-timeout";

/** The flash's two animations; each reports whether it ran to its end. */
export interface SnapshotFlashAnimations {
  fly(onEnd: (isFinished: boolean) => void): void;
  fade(onEnd: (isFinished: boolean) => void): void;
  /** Stops whatever is running (the cleanup; its ends report unfinished). */
  stop(): void;
}

/**
 * The snapshot flash's timeline, like the web's (components/snapshots/
 * snapshot-flash): the flight starts right away (skipped with reduced motion,
 * where the card already sits at its landing spot), the fade starts on a
 * timer at flyMs + holdMs, and the flash is done when the fade finishes. Timers,
 * not chained animation callbacks, drive the hold, so a flight that ends early
 * or late can't shorten it. An interrupted animation never counts as done; a
 * safety timeout ends the flash if the fade never reports its end. Returns the
 * cancel (stops everything, `onDone` is never called afterwards).
 */
export function runSnapshotFlashSequence(
  animations: SnapshotFlashAnimations,
  options: { isReducedMotion: boolean; onDone: (end: SnapshotFlashEnd) => void },
): () => void {
  const { flyMs, holdMs, fadeMs } = snapshotFlash;
  let isOver = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const finish = (end: SnapshotFlashEnd): void => {
    if (isOver) return;
    isOver = true;
    for (const timer of timers) clearTimeout(timer);
    options.onDone(end);
  };

  if (!options.isReducedMotion) {
    // The flight's end changes nothing: the hold runs on its own timer.
    animations.fly(() => {});
  }
  timers.push(
    setTimeout(() => {
      animations.fade((isFinished) => {
        if (isFinished) finish("faded");
      });
    }, flyMs + holdMs),
  );
  timers.push(setTimeout(() => finish("safety-timeout"), flyMs + holdMs + fadeMs + SNAPSHOT_FLASH_SAFETY_MARGIN_MS));

  return () => {
    isOver = true;
    for (const timer of timers) clearTimeout(timer);
    animations.stop();
  };
}
