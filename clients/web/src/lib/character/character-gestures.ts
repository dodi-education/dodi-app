/**
 * Turning and zooming the character by hand. Press on the character, hold and
 * drag to turn it; pinch or scroll anywhere in its area (the page around it)
 * to zoom. A press on the character that does not move is a tap, wherever the
 * character is drawn (zoomed in, it reaches past its button); the click that
 * ends a drag is swallowed, so turning dodi never taps it. Other controls in
 * the area (buttons, links) are left alone.
 */

// Movement below this is still a tap.
const DRAG_THRESHOLD_PX = 6;
const WHEEL_ZOOM_PER_PX = 0.002;
// The click a drag ends with follows its pointerup at once; later ones are real taps.
const SWALLOW_CLICK_MS = 500;

export interface GestureTarget {
  /** The point (client coordinates) lies on the character. */
  hitsCharacter(clientX: number, clientY: number): boolean;
  /** The press landed on some other control of the page, not dodi's own button. */
  isOnOtherControl(eventTarget: EventTarget | null): boolean;
  /** The click lands on dodi's own button already, which handles the tap itself. */
  reachesTapButton(eventTarget: EventTarget | null): boolean;
  /** Tap dodi (its button's action), for taps on the character outside its button. */
  tap(): void;
  orbitBy(dxPx: number, dyPx: number): void;
  zoomBy(factor: number): void;
}

interface TrackedPointer {
  x: number;
  y: number;
}

/** Listen on `area`; returns the detach. */
export function attachCharacterGestures(area: HTMLElement, target: GestureTarget): () => void {
  const pointers = new Map<number, TrackedPointer>();
  let canOrbit = false;
  let isTapOnCharacter = false;
  let start: TrackedPointer | null = null;
  let isDragging = false;
  let pinchDistance = 0;
  let swallowClicksUntil = 0;

  const previousTouchAction = area.style.touchAction;
  area.style.touchAction = "none"; // the page must not scroll or zoom under the gesture

  function spread(): number {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointers.size === 0) {
      if (target.isOnOtherControl(event.target)) return;
      const isOnCharacter = target.hitsCharacter(event.clientX, event.clientY);
      canOrbit = isOnCharacter;
      isTapOnCharacter = isOnCharacter;
      start = { x: event.clientX, y: event.clientY };
      isDragging = false;
      swallowClicksUntil = 0;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      pinchDistance = spread();
      isDragging = true; // two fingers are never a tap
      isTapOnCharacter = false;
    }
    if (canOrbit || pointers.size > 1) area.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent): void {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (pointers.size >= 2) {
      const distance = spread();
      if (pinchDistance > 0 && distance > 0) target.zoomBy(distance / pinchDistance);
      pinchDistance = distance;
      return;
    }
    if (!canOrbit || !start) return;
    if (!isDragging && Math.hypot(event.clientX - start.x, event.clientY - start.y) < DRAG_THRESHOLD_PX) return;
    isDragging = true;
    isTapOnCharacter = false;
    area.style.cursor = "grabbing";
    target.orbitBy(dx, dy);
  }

  function onPointerEnd(event: PointerEvent): void {
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 1) pinchDistance = 0;
    if (pointers.size > 0) return;
    if (isDragging) swallowClicksUntil = performance.now() + SWALLOW_CLICK_MS;
    area.style.cursor = "";
    start = null;
  }

  // Capture phase on the area, so dodi's button never hears a swallowed click.
  function onClick(event: MouseEvent): void {
    const wasTapOnCharacter = isTapOnCharacter;
    isTapOnCharacter = false;
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
