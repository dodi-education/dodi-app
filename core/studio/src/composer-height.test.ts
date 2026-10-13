import { describe, expect, it } from "vitest";

import {
  COMPOSER_HEIGHT_BOUNDS,
  COMPOSER_HEIGHT_KEYS,
  COMPOSER_ONE_LINE,
  COMPOSER_SURFACE_MAX,
  composerInputHeight,
  dragComposerHeight,
  readComposerHeight,
  stepComposerHeight,
} from "./composer-height";

describe("composer height", () => {
  it("starts at half the side-by-side height on a phone", () => {
    expect(COMPOSER_HEIGHT_BOUNDS.vertical.initial).toBe(COMPOSER_HEIGHT_BOUNDS.side.initial / 2);
  });

  it("remembers each layout under its own key, the side one under the original key", () => {
    expect(COMPOSER_HEIGHT_KEYS.side).toBe("dodi-studio-input-height");
    expect(COMPOSER_HEIGHT_KEYS.vertical).not.toBe(COMPOSER_HEIGHT_KEYS.side);
  });

  describe("readComposerHeight", () => {
    it("falls back to the layout's initial height when nothing is stored", () => {
      expect(readComposerHeight(null, "side")).toBe(150);
      expect(readComposerHeight(null, "vertical")).toBe(75);
    });

    it("keeps a stored height inside the layout's bounds", () => {
      expect(readComposerHeight("200", "side")).toBe(200);
      expect(readComposerHeight("120", "vertical")).toBe(120);
    });

    it("ignores a stored height outside the bounds, or garbage", () => {
      expect(readComposerHeight("400", "vertical")).toBe(75);
      expect(readComposerHeight("10", "side")).toBe(150);
      expect(readComposerHeight("tall", "side")).toBe(150);
    });
  });

  describe("dragComposerHeight", () => {
    it("grows when the grip moves up and shrinks when it moves down", () => {
      expect(dragComposerHeight(75, -40, "vertical")).toBe(115);
      expect(dragComposerHeight(115, 20, "vertical")).toBe(95);
    });

    it("stops at the layout's bounds", () => {
      expect(dragComposerHeight(75, -1000, "vertical")).toBe(COMPOSER_HEIGHT_BOUNDS.vertical.max);
      expect(dragComposerHeight(75, 1000, "vertical")).toBe(COMPOSER_HEIGHT_BOUNDS.vertical.min);
      expect(dragComposerHeight(150, -1000, "side")).toBe(COMPOSER_HEIGHT_BOUNDS.side.max);
    });

    it("lands on whole pixels", () => {
      expect(dragComposerHeight(75, -10.4, "vertical")).toBe(85);
    });
  });

  describe("stepComposerHeight", () => {
    it("steps up and down within the bounds", () => {
      expect(stepComposerHeight(75, "grow", "vertical")).toBe(99);
      expect(stepComposerHeight(75, "shrink", "vertical")).toBe(51);
      expect(stepComposerHeight(51, "shrink", "vertical")).toBe(COMPOSER_HEIGHT_BOUNDS.vertical.min);
      expect(stepComposerHeight(COMPOSER_HEIGHT_BOUNDS.side.max, "grow", "side")).toBe(COMPOSER_HEIGHT_BOUNDS.side.max);
    });
  });

  describe("composerInputHeight", () => {
    it("is the chosen height without a plan surface", () => {
      expect(composerInputHeight({ height: 120, isSurfaceOpen: false, hasText: false })).toBe(120);
    });

    it("drops to one line on an open plan surface, and grows back a little with text", () => {
      expect(composerInputHeight({ height: 120, isSurfaceOpen: true, hasText: false })).toBe(COMPOSER_ONE_LINE);
      expect(composerInputHeight({ height: 120, isSurfaceOpen: true, hasText: true })).toBe(COMPOSER_SURFACE_MAX);
      expect(composerInputHeight({ height: 75, isSurfaceOpen: true, hasText: true })).toBe(75);
    });
  });
});
