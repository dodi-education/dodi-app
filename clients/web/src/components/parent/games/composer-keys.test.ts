import { describe, expect, it } from "vitest";
import { isComposerSendKey } from "./composer-keys";

describe("isComposerSendKey", () => {
  it("sends on Enter with a fine pointer (desktop)", () => {
    expect(isComposerSendKey({ key: "Enter", shiftKey: false }, { isTouch: false })).toBe(true);
  });

  it("inserts a newline on Shift+Enter with a fine pointer", () => {
    expect(isComposerSendKey({ key: "Enter", shiftKey: true }, { isTouch: false })).toBe(false);
  });

  it("ignores other keys", () => {
    expect(isComposerSendKey({ key: "a", shiftKey: false }, { isTouch: false })).toBe(false);
  });

  // Bug: on a phone the on-screen return key fired send instead of a newline.
  it("inserts a newline on Enter with a touch (coarse) pointer", () => {
    expect(isComposerSendKey({ key: "Enter", shiftKey: false }, { isTouch: true })).toBe(false);
  });

  it("does not send on Enter that confirms an IME candidate", () => {
    expect(
      isComposerSendKey({ key: "Enter", shiftKey: false, isComposing: true }, { isTouch: false }),
    ).toBe(false);
  });
});
