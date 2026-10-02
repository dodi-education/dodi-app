import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The app mirrors the web's classes, so `1rem` must mean the same on both.
 * The web leaves the root font size at the browser default (16px); NativeWind
 * defaults `inlineRem` to 14, which rendered every rem-based class at 87.5%
 * (on a Pixel 10 the switch track measured 31.6 × 17.5 instead of 36 × 20, so
 * the thumb's pixel offsets pushed it past the track's end).
 */
const WEB_ROOT_FONT_SIZE_PX = 16;

describe("NativeWind rem", () => {
  it("matches the web's root font size", () => {
    const webCss = readFileSync(resolve(__dirname, "../../web/src/app/globals.css"), "utf8");
    // The web relies on the browser default; a root font-size override would change it.
    expect(webCss).not.toMatch(/(^|\n)\s*(html|:root)\s*\{[^}]*font-size/);

    const metro = readFileSync(resolve(__dirname, "../metro.config.js"), "utf8");
    const inlineRem = metro.match(/inlineRem:\s*(\d+)/)?.[1];
    expect(Number(inlineRem)).toBe(WEB_ROOT_FONT_SIZE_PX);
  });
});
