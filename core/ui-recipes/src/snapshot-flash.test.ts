import { describe, expect, it } from "vitest";

import { snapshotFlashTarget } from "./index";

/**
 * Where the snapshot flash lands: a 100×100 card centered 12px above the
 * Snapshots item of the kid nav (the web's snapshot-flash.tsx). The app guessed
 * a bottom-center spot instead, so on a phone the card didn't sit over
 * "Knipser" (the third of four nav items).
 */
describe("snapshotFlashTarget", () => {
  it("centers the card 12px above the Snapshots nav item", () => {
    const navItem = { left: 210, top: 830, width: 88, height: 52 };
    expect(snapshotFlashTarget(navItem, { width: 411, height: 923 })).toEqual({
      left: 210 + 44 - 50,
      top: 830 - 100 - 12,
      width: 100,
      height: 100,
    });
  });

  it("falls back to bottom-center when the page has no kid nav", () => {
    expect(snapshotFlashTarget(null, { width: 400, height: 900 })).toEqual({
      left: 150,
      top: 900 - 100 - 12,
      width: 100,
      height: 100,
    });
  });
});
