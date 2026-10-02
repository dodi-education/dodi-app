import { CharacterGestureRecognizer, type GestureRecognizerTarget } from "@dodi/character/character-gestures";

/**
 * Turning and zooming the character by hand. Press on the character, hold and
 * drag to turn it; pinch or scroll anywhere in its area (the page around it)
 * to zoom. A press on the character that does not move is a tap, wherever the
 * character is drawn (zoomed in, it reaches past its button); the click that
 * ends a drag is swallowed, so turning dodi never taps it. Other controls in
 * the area (buttons, links) are left alone.
 */

const WHEEL_ZOOM_PER_PX = 0.002;
// The click a drag ends with follows its pointerup at once; later ones are real taps.
const SWALLOW_CLICK_MS = 500;

export interface GestureTarget extends GestureRecognizerTarget {
  /** The press landed on some other control of the page, not dodi's own button. */
  isOnOtherControl(eventTarget: EventTarget | null): boolean;
  /** The click lands on dodi's own button already, which handles the tap itself. */
  reachesTapButton(eventTarget: EventTarget | null): boolean;
  /** Tap dodi (its button's action), for taps on the character outside its button. */
  tap(): void;
}

/** Listen on `area`; returns the detach. */
export function attachCharacterGestures(area: HTMLElement, target: GestureTarget): () => void {
  // The pointer logic (drag to turn, pinch, tap) is shared with the app.
  const recognizer = new CharacterGestureRecognizer(target);
  let swallowClicksUntil = 0;

  const previousTouchAction = area.style.touchAction;
  area.style.touchAction = "none"; // the page must not scroll or zoom under the gesture

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (recognizer.pointerCount === 0) {
      if (target.isOnOtherControl(event.target)) return;
      swallowClicksUntil = 0;
    }
    if (recognizer.pointerDown(event.pointerId, event.clientX, event.clientY)) {
      area.setPointerCapture(event.pointerId);
    }
  }

  function onPointerMove(event: PointerEvent): void {
    if (recognizer.pointerMove(event.pointerId, event.clientX, event.clientY)) area.style.cursor = "grabbing";
  }

  function onPointerEnd(event: PointerEvent): void {
    const end = recognizer.pointerUp(event.pointerId);
    if (!end) return;
    if (end.wasDrag) swallowClicksUntil = performance.now() + SWALLOW_CLICK_MS;
    area.style.cursor = "";
  }

  // Capture phase on the area, so dodi's button never hears a swallowed click.
  function onClick(event: MouseEvent): void {
    const wasTapOnCharacter = recognizer.takeTap();
    if (performance.now() <= swallowClicksUntil) {
      swallowClicksUntil = 0;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (wasTapOnCharacter && !target.reachesTapButton(event.target)) target.tap();
  }

  function onWheel(event: WheelEvent): void {
    if (target.isOnOtherControl(event.target)) return;
    event.preventDefault();
    target.zoomBy(Math.exp(-event.deltaY * WHEEL_ZOOM_PER_PX));
  }

  area.addEventListener("pointerdown", onPointerDown);
  area.addEventListener("pointermove", onPointerMove);
  area.addEventListener("pointerup", onPointerEnd);
  area.addEventListener("pointercancel", onPointerEnd);
  area.addEventListener("click", onClick, true);
  area.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    area.removeEventListener("pointerdown", onPointerDown);
    area.removeEventListener("pointermove", onPointerMove);
    area.removeEventListener("pointerup", onPointerEnd);
    area.removeEventListener("pointercancel", onPointerEnd);
    area.removeEventListener("click", onClick, true);
    area.removeEventListener("wheel", onWheel);
    area.style.touchAction = previousTouchAction;
    area.style.cursor = "";
  };
}
