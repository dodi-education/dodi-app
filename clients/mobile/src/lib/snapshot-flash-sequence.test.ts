import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { snapshotFlash } from "@dodi/ui-recipes";

import {
  SNAPSHOT_FLASH_SAFETY_MARGIN_MS,
  type SnapshotFlashAnimations,
  runSnapshotFlashSequence,
} from "./snapshot-flash-sequence";

const { flyMs, holdMs, fadeMs } = snapshotFlash;

/** Animations whose ends the test reports by hand. */
function fakeAnimations() {
  const ends: { fly?: (isFinished: boolean) => void; fade?: (isFinished: boolean) => void } = {};
  const animations: SnapshotFlashAnimations = {
    fly: vi.fn((onEnd) => {
      ends.fly = onEnd;
    }),
    fade: vi.fn((onEnd) => {
      ends.fade = onEnd;
    }),
    stop: vi.fn(() => {
      // Like Animated: stopping reports the running animations unfinished.
      ends.fly?.(false);
      ends.fade?.(false);
    }),
  };
  return { animations, ends };
}

/**
 * The device log showed the flash unmounting right after it mounted: a
 * re-run stopped the animation and its `finished: false` end was taken as done.
 */
describe("runSnapshotFlashSequence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("flies, holds, then fades, and is done only when the fade finishes", () => {
    const { animations, ends } = fakeAnimations();
    const onDone = vi.fn();
    runSnapshotFlashSequence(animations, { isReducedMotion: false, onDone });

    expect(animations.fly).toHaveBeenCalledTimes(1);
    ends.fly?.(true);
    vi.advanceTimersByTime(flyMs + holdMs - 1);
    expect(animations.fade).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(animations.fade).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();

    ends.fade?.(true);
    expect(onDone).toHaveBeenCalledWith("faded");
    vi.advanceTimersByTime(10_000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("with reduced motion skips the flight but still holds and fades", () => {
    const { animations, ends } = fakeAnimations();
    const onDone = vi.fn();
    runSnapshotFlashSequence(animations, { isReducedMotion: true, onDone });

    expect(animations.fly).not.toHaveBeenCalled();
    vi.advanceTimersByTime(flyMs + holdMs);
    expect(animations.fade).toHaveBeenCalledTimes(1);
    ends.fade?.(true);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("never counts an interrupted animation as done", () => {
    const { animations, ends } = fakeAnimations();
    const onDone = vi.fn();
    runSnapshotFlashSequence(animations, { isReducedMotion: false, onDone });

    ends.fly?.(false);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(flyMs + holdMs);
    ends.fade?.(false);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("cancelling stops the animations without calling onDone", () => {
    const { animations } = fakeAnimations();
    const onDone = vi.fn();
    const cancel = runSnapshotFlashSequence(animations, { isReducedMotion: false, onDone });

    vi.advanceTimersByTime(flyMs + holdMs);
    cancel();
    expect(animations.stop).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("ends by the safety timeout when the fade never reports its end", () => {
    const { animations } = fakeAnimations();
    const onDone = vi.fn();
    runSnapshotFlashSequence(animations, { isReducedMotion: false, onDone });

    vi.advanceTimersByTime(flyMs + holdMs + fadeMs + SNAPSHOT_FLASH_SAFETY_MARGIN_MS - 1);
    expect(onDone).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDone).toHaveBeenCalledWith("safety-timeout");
  });
});
