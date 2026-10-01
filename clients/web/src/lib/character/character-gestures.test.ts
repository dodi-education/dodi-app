import { describe, expect, it } from "vitest";

import { attachCharacterGestures, type GestureTarget } from "./character-gestures";

// No DOM in this suite: a bare EventTarget stands in for the area element, and
// `under` says what the pointer is over (the test moves it along).
type Under = "page" | "button" | "control";

function pointer(type: string, pointerId: number, clientX: number, clientY: number): Event {
  return Object.assign(new Event(type, { cancelable: true }), {
    pointerId,
    clientX,
    clientY,
    pointerType: "touch",
    button: 0,
  });
}

// The character is drawn over x < 100; zoomed in, it reaches past its button.
function setup() {
  const area = Object.assign(new EventTarget(), {
    style: { touchAction: "", cursor: "" },
    setPointerCapture: () => {},
  });
  let under: Under = "page";
  const calls = { orbit: [] as [number, number][], zoom: [] as number[], forwardedTaps: 0, buttonTaps: 0 };
  const target: GestureTarget = {
    hitsCharacter: (x) => x < 100,
    isOnOtherControl: () => under === "control",
    reachesTapButton: () => under === "button",
    tap: () => calls.forwardedTaps++,
    orbitBy: (dx, dy) => calls.orbit.push([dx, dy]),
    zoomBy: (factor) => calls.zoom.push(factor),
  };
  const detach = attachCharacterGestures(area as unknown as HTMLElement, target);
  const press = (where: Under, ...events: Event[]) => {
    under = where;
    for (const event of events) area.dispatchEvent(event);
  };
  // The click the browser sends after the press; dodi's button hears it unless stopped.
  const click = () => {
    const event = new Event("click", { cancelable: true });
    let isStopped = false;
    event.stopPropagation = () => (isStopped = true);
    area.dispatchEvent(event);
    if (!isStopped && under === "button") calls.buttonTaps++;
  };
  return { area, calls, detach, press, click };
}

describe("attachCharacterGestures", () => {
  it("turns the character from a press and drag on it, and the release does not tap it", () => {
    const { calls, press, click } = setup();
    press(
      "button",
      pointer("pointerdown", 1, 50, 50),
      pointer("pointermove", 1, 60, 50),
      pointer("pointermove", 1, 70, 55),
      pointer("pointerup", 1, 70, 55),
    );
    click();
    expect(calls.orbit).toEqual([
      [10, 0],
      [10, 5],
    ]);
    expect(calls.buttonTaps).toBe(0);
    expect(calls.forwardedTaps).toBe(0);
  });

  it("turns the zoomed character from a drag on it outside its button, without tapping", () => {
    const { calls, press, click } = setup();
    press("page", pointer("pointerdown", 1, 50, 400), pointer("pointermove", 1, 90, 400), pointer("pointerup", 1, 90, 400));
    click();
    expect(calls.orbit).toEqual([[40, 0]]);
    expect(calls.forwardedTaps).toBe(0);
  });

  it("does not turn the character from a drag beside it", () => {
    const { calls, press, click } = setup();
    press("page", pointer("pointerdown", 1, 300, 50), pointer("pointermove", 1, 340, 50), pointer("pointerup", 1, 340, 50));
    click();
    expect(calls.orbit).toEqual([]);
    expect(calls.forwardedTaps).toBe(0);
  });

  it("taps dodi on a press on the character that does not move", () => {
    const { calls, press, click } = setup();
    press("button", pointer("pointerdown", 1, 50, 50), pointer("pointermove", 1, 52, 51), pointer("pointerup", 1, 52, 51));
    click();
    expect(calls.orbit).toEqual([]);
    expect(calls.buttonTaps).toBe(1);
    expect(calls.forwardedTaps).toBe(0);
  });

  it("taps dodi when the zoomed character is tapped outside its button", () => {
    const { calls, press, click } = setup();
    press("page", pointer("pointerdown", 1, 50, 400), pointer("pointerup", 1, 50, 400));
    click();
    expect(calls.forwardedTaps).toBe(1);
  });

  it("leaves other controls alone", () => {
    const { calls, press, click } = setup();
    press("control", pointer("pointerdown", 1, 50, 50), pointer("pointermove", 1, 90, 50), pointer("pointerup", 1, 90, 50));
    click();
    expect(calls.orbit).toEqual([]);
    expect(calls.forwardedTaps).toBe(0);
  });

  it("zooms with a pinch, without tapping", () => {
    const { calls, press, click } = setup();
    press(
      "button",
      pointer("pointerdown", 1, 50, 100),
      pointer("pointerdown", 2, 250, 100),
      pointer("pointermove", 2, 450, 100),
      pointer("pointerup", 2, 450, 100),
      pointer("pointerup", 1, 50, 100),
    );
    click();
    expect(calls.zoom).toEqual([2]);
    expect(calls.orbit).toEqual([]);
    expect(calls.buttonTaps).toBe(0);
  });

  it("does not swallow the next real tap after a drag without a click", () => {
    const { calls, press, click } = setup();
    press("button", pointer("pointerdown", 1, 50, 50), pointer("pointermove", 1, 90, 50), pointer("pointerup", 1, 90, 50));
    press("button", pointer("pointerdown", 1, 50, 50), pointer("pointerup", 1, 50, 50));
    click();
    expect(calls.buttonTaps).toBe(1);
  });

  it("stops listening once detached", () => {
    const { area, calls, detach, press } = setup();
    detach();
    press("button", pointer("pointerdown", 1, 50, 50), pointer("pointermove", 1, 90, 50));
    expect(calls.orbit).toEqual([]);
    expect(area.style.touchAction).toBe("");
  });
});
