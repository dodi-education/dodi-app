/**
 * Keyboard avoidance for a KeyboardAvoidingView below a top bar. The app draws
 * edge to edge (Expo SDK 57, `edgeToEdgeEnabled=true`), so on Android the
 * window no longer shrinks for the keyboard (`adjustResize` is a no-op) and a
 * KeyboardAvoidingView without a `behavior` does nothing: both platforms pad.
 *
 * The view lifts by `frame.y + frame.height - (keyboardTop - offset)`, with
 * `keyboardTop` in screen coordinates and `frame` in its parent's, so the
 * offset is the parent's distance from the screen top. The content's bottom
 * inset padding sits under the open keyboard, so it comes off the lift (else
 * the content floats a navigation bar's height above the keyboard).
 *
 * Pure (no react-native import): screens spread it onto the view and the
 * test runs in Node.
 */

export interface KeyboardAvoidanceInput {
  /** Distance from the screen top to the view's parent (top bar + status bar inset). */
  top: number;
  /** The bottom safe-area inset the content already pads. */
  bottomInset: number;
}

export interface KeyboardAvoidance {
  /** KeyboardAvoidingView's `behavior`. */
  behavior: "height" | "position" | "padding";
  keyboardVerticalOffset: number;
}

/** The KeyboardAvoidingView props for a view `top` below the screen top that pads `bottomInset`. */
export function keyboardAvoidance({ top, bottomInset }: KeyboardAvoidanceInput): KeyboardAvoidance {
  return { behavior: "padding", keyboardVerticalOffset: top - bottomInset };
}
