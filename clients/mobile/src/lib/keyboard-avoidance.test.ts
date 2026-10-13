import { describe, expect, it } from "vitest";

import { keyboardAvoidance } from "./keyboard-avoidance";

/**
 * Bug: on Android the Game Studio's composer stayed under the keyboard. The
 * app draws edge to edge (Expo SDK 57, `edgeToEdgeEnabled=true`), so the
 * window no longer shrinks for the keyboard (`adjustResize` is a no-op) and a
 * KeyboardAvoidingView without a `behavior` does nothing there.
 */
describe("keyboardAvoidance", () => {
  it("lifts the content on Android, where the edge-to-edge window does not resize", () => {
    expect(keyboardAvoidance({ top: 84, bottomInset: 48 }).behavior).toBe("padding");
  });

  it("measures the overlap from the screen top: the offset is where the view starts", () => {
    expect(keyboardAvoidance({ top: 107, bottomInset: 0 }).keyboardVerticalOffset).toBe(107);
  });

  it("does not lift twice for the bottom inset the content already pads (it sits under the keyboard)", () => {
    // Without this the composer floats a navigation bar's height above the keyboard.
    expect(keyboardAvoidance({ top: 84, bottomInset: 48 }).keyboardVerticalOffset).toBe(36);
  });
});
