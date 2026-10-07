import { describe, expect, it } from "vitest";

import { decideFigureMode, FIGURE_DECISION_BUDGET_MS, type FigureModeInput } from "./figure-mode";

/**
 * The companion figure is either the 2D artwork or the 3D character, decided
 * before anything shows. Both clients used to show the 2D figure as a
 * placeholder while the 3D character loaded, then swap it in (seen on a
 * Pixel 10: home flashed 2D, then 3D).
 */
const base: FigureModeInput = {
  is3dEnabled: true,
  load: "loading",
  elapsedMs: 0,
  previous: "pending",
};

describe("decideFigureMode", () => {
  it("waits (shows nothing) while the 3D character loads", () => {
    expect(decideFigureMode(base)).toBe("pending");
  });

  it("waits while the account's 3D preference is still unknown", () => {
    expect(decideFigureMode({ ...base, is3dEnabled: null, load: "ready" })).toBe("pending");
  });

  it("shows 3D once it is ready, 2D when it is off or failed", () => {
    expect(decideFigureMode({ ...base, load: "ready" })).toBe("3d");
    expect(decideFigureMode({ ...base, is3dEnabled: false })).toBe("2d");
    expect(decideFigureMode({ ...base, load: "failed" })).toBe("2d");
  });

  it("settles on 2D when 3D takes longer than the budget, and never switches to 3D afterwards", () => {
    const late = decideFigureMode({ ...base, elapsedMs: FIGURE_DECISION_BUDGET_MS + 1 });
    expect(late).toBe("2d");
    expect(decideFigureMode({ ...base, load: "ready", previous: late })).toBe("2d");
  });

  it("keeps 3D once shown, falling back to 2D only if it fails", () => {
    expect(decideFigureMode({ ...base, load: "ready", previous: "3d", elapsedMs: 99_999 })).toBe("3d");
    expect(decideFigureMode({ ...base, load: "failed", previous: "3d" })).toBe("2d");
  });

  it("follows the setting being switched off", () => {
    expect(decideFigureMode({ ...base, is3dEnabled: false, load: "ready", previous: "3d" })).toBe("2d");
  });
});
