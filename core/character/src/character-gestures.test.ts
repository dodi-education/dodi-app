import { describe, expect, it } from "vitest";

import { CharacterGestureRecognizer } from "./character-gestures";

// The character covers x < 100.
function setup() {
  const calls = { orbit: [] as [number, number][], zoom: [] as number[] };
  const recognizer = new CharacterGestureRecognizer({
    hitsCharacter: (x) => x < 100,
    orbitBy: (dx, dy) => calls.orbit.push([dx, dy]),
    zoomBy: (factor) => calls.zoom.push(factor),
  });
  return { recognizer, calls };
}

describe("CharacterGestureRecognizer", () => {
  it("turns the character when a press on it drags past the threshold, and that is no tap", () => {
    const { recognizer, calls } = setup();
    expect(recognizer.pointerDown(1, 50, 50)).toBe(true);
    expect(recognizer.pointerMove(1, 53, 50)).toBe(false); // still a tap
    expect(recognizer.pointerMove(1, 70, 60)).toBe(true);
    expect(calls.orbit).toEqual([[17, 10]]);
    expect(recognizer.pointerUp(1)).toEqual({ wasDrag: true });
    expect(recognizer.takeTap()).toBe(false);
  });

  it("reports a still press on the character as a tap, once", () => {
    const { recognizer } = setup();
    recognizer.pointerDown(1, 50, 50);
    expect(recognizer.pointerUp(1)).toEqual({ wasDrag: false });
    expect(recognizer.takeTap()).toBe(true);
    expect(recognizer.takeTap()).toBe(false);
  });

  it("leaves presses beside the character alone, unless a second finger pinches", () => {
    const { recognizer, calls } = setup();
    expect(recognizer.pointerDown(1, 200, 50)).toBe(false);
    recognizer.pointerMove(1, 260, 50);
    expect(calls.orbit).toEqual([]);
    expect(recognizer.pointerDown(2, 300, 50)).toBe(true);
    recognizer.pointerMove(2, 340, 50); // spread 40 -> 80
    expect(calls.zoom).toEqual([2]);
    expect(recognizer.pointerUp(2)).toBeNull();
    expect(recognizer.pointerUp(1)).toEqual({ wasDrag: true });
    expect(recognizer.takeTap()).toBe(false);
  });

  it("ignores pointers it never saw go down", () => {
    const { recognizer } = setup();
    expect(recognizer.pointerMove(7, 1, 1)).toBe(false);
    expect(recognizer.pointerUp(7)).toBeNull();
  });
});
