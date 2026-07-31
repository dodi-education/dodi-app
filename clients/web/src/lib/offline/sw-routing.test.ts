import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Unit-tests the service worker's navigation routing (public/sw.js exposes its
 * pure helpers on `self.__TEST__` for exactly this file). The load-bearing
 * assertion: a kid-section URL must NEVER fall back to another section's
 * cached shell — a Next.js shell hydrates the route baked into its flight
 * payload, so serving the /home shell for /snapshots renders the Home screen
 * at the /snapshots URL (the reported "jumps back to Home" offline bug).
 */

interface SwTestSurface {
  kidSection(pathname: string): string | undefined;
  detailShellKey(pathname: string): string | null;
  navigationFallbackKeys(pathname: string): string[];
  KID_SECTIONS: string[];
}

function loadSwTestSurface(): SwTestSurface {
  const src = readFileSync(
    fileURLToPath(new URL("../../../public/sw.js", import.meta.url)),
    "utf8",
  );
  const self = {
    addEventListener: () => {},
    __TEST__: undefined as SwTestSurface | undefined,
  };
  // The worker script only registers listeners at the top level; evaluating it
  // with a stub `self` captures the helpers without running any handler.
  new Function("self", "caches", src)(self, undefined);
  if (!self.__TEST__) throw new Error("sw.js did not expose __TEST__");
  return self.__TEST__;
}

const sw = loadSwTestSurface();

describe("sw navigation fallback", () => {
  it("never falls back across sections (the offline 'jumps back to Home' bug)", () => {
    expect(sw.navigationFallbackKeys("/snapshots")).toEqual(["/snapshots"]);
    expect(sw.navigationFallbackKeys("/friends")).toEqual(["/friends"]);
    expect(sw.navigationFallbackKeys("/games")).toEqual(["/games"]);
    expect(sw.navigationFallbackKeys("/snapshots")).not.toContain("/home");
  });

  it("root falls back to the home shell (mirrors the online redirect)", () => {
    expect(sw.navigationFallbackKeys("/")).toEqual(["/home"]);
    expect(sw.navigationFallbackKeys("/home")).toEqual(["/home"]);
  });

  it("detail URLs try exact → universal detail shell → own section library", () => {
    expect(sw.navigationFallbackKeys("/games/abc-123")).toEqual([
      "/games/abc-123",
      "/games/__detail-shell",
      "/games",
    ]);
    expect(sw.navigationFallbackKeys("/snapshots/xyz")).toEqual([
      "/snapshots/xyz",
      "/snapshots/__detail-shell",
      "/snapshots",
    ]);
  });

  it("non-kid routes get no shell fallback (parent/login are online-only)", () => {
    expect(sw.navigationFallbackKeys("/parent/dashboard")).toEqual([]);
    expect(sw.navigationFallbackKeys("/login")).toEqual([]);
  });

  it("warms all four kid sections so every tab works offline", () => {
    expect(sw.KID_SECTIONS).toEqual(["/home", "/games", "/snapshots", "/friends"]);
  });
});
