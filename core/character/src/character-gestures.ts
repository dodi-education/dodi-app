/**
 * Turning and zooming the character by hand, from raw pointer input (each
 * client feeds it its own events: DOM pointer events on the web, touches on
 * the app). Press on the character, hold and drag to turn it; pinch to zoom.
 * A press on the character that does not move is a tap. Coordinates are in
 * any one consistent unit (CSS px, points).
 */

// Movement below this is still a tap.
export const DRAG_THRESHOLD_PX = 6;

export interface GestureRecognizerTarget {
  /** The point (in the caller's coordinates) lies on the character. */
  hitsCharacter(x: number, y: number): boolean;
  orbitBy(dxPx: number, dyPx: number): void;
  zoomBy(factor: number): void;
}

interface TrackedPointer {
  x: number;
  y: number;
}

/** The outcome of the last pointer lifting. */
export interface GestureEnd {
  /** The pointers moved the character (a turn or a pinch), so this was no tap. */
  wasDrag: boolean;
}

export class CharacterGestureRecognizer {
  private readonly pointers = new Map<number, TrackedPointer>();
  private canOrbit = false;
  private isTapOnCharacter = false;
  private start: TrackedPointer | null = null;
  private isDragging = false;
  private pinchDistance = 0;

  constructor(private readonly target: GestureRecognizerTarget) {}

  /** Pointers currently down. */
  get pointerCount(): number {
    return this.pointers.size;
  }

  /** A pointer went down; returns whether the caller should capture it (it is the gesture's). */
  pointerDown(pointerId: number, x: number, y: number): boolean {
    if (this.pointers.size === 0) {
      const isOnCharacter = this.target.hitsCharacter(x, y);
      this.canOrbit = isOnCharacter;
      this.isTapOnCharacter = isOnCharacter;
      this.start = { x, y };
      this.isDragging = false;
    }
    this.pointers.set(pointerId, { x, y });
    if (this.pointers.size === 2) {
      this.pinchDistance = this.spread();
      this.isDragging = true; // two fingers are never a tap
      this.isTapOnCharacter = false;
    }
    return this.canOrbit || this.pointers.size > 1;
  }

  /** A pointer moved; returns whether it turned the character. */
  pointerMove(pointerId: number, x: number, y: number): boolean {
    const pointer = this.pointers.get(pointerId);
    if (!pointer) return false;
    const dx = x - pointer.x;
    const dy = y - pointer.y;
    pointer.x = x;
    pointer.y = y;

    if (this.pointers.size >= 2) {
      const distance = this.spread();
      if (this.pinchDistance > 0 && distance > 0) this.target.zoomBy(distance / this.pinchDistance);
      this.pinchDistance = distance;
      return false;
    }
    if (!this.canOrbit || !this.start) return false;
    if (!this.isDragging && Math.hypot(x - this.start.x, y - this.start.y) < DRAG_THRESHOLD_PX) return false;
    this.isDragging = true;
    this.isTapOnCharacter = false;
    this.target.orbitBy(dx, dy);
    return true;
  }

  /** A pointer lifted (or was cancelled); returns the gesture's end once the last one is up. */
  pointerUp(pointerId: number): GestureEnd | null {
    if (!this.pointers.delete(pointerId)) return null;
    if (this.pointers.size === 1) this.pinchDistance = 0;
    if (this.pointers.size > 0) return null;
    this.start = null;
    return { wasDrag: this.isDragging };
  }

  /** Whether the press that just ended was a tap on the character; reading it clears it. */
  takeTap(): boolean {
    const wasTap = this.isTapOnCharacter;
    this.isTapOnCharacter = false;
    return wasTap;
  }

  private spread(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
