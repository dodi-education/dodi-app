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
  extractShellAssets(html: string): string[];
  KID_SECTIONS: string[];
  SYNTHETIC_DETAIL_PATHS: string[];
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

  it("warms the universal detail shells via synthetic ids (no online detail visit needed)", () => {
    expect(sw.SYNTHETIC_DETAIL_PATHS).toEqual([
      "/games/__shell",
      "/snapshots/__shell",
    ]);
    // The synthetic paths must land under the detail-shell cache keys the
    // fallback chain looks up.
    expect(sw.detailShellKey("/games/__shell")).toBe("/games/__detail-shell");
    expect(sw.detailShellKey("/snapshots/__shell")).toBe(
      "/snapshots/__detail-shell",
    );
  });
});

describe("sw shell asset extraction", () => {
  // A warmed shell's HTML references route chunks the browser never fetched
  // (the page was never visited online). Offline, hydration then dies on a
  // ChunkLoadError — the reported "Application error: a client-side
  // exception" on never-visited tabs. The worker must pre-cache every
  // /_next/static asset a shell references.
  it("finds script/css/font refs incl. route-group chunks and flight strings", () => {
    const html = `<!doctype html><html><head>
      <link rel="stylesheet" href="/_next/static/css/abc123.css">
      <link rel="preload" href="/_next/static/media/nunito-latin.woff2" as="font">
      <script src="/_next/static/chunks/app/%28kid%29/snapshots/page-11aa22.js" defer></script>
      </head><body>
      <script>self.__next_f.push([1,"5:I[123,[\\"static/chunks/4567-def.js\\",\\"static/chunks/app/%28kid%29/friends/page-33cc.js\\"],\\"default\\"]"])</script>
      </body></html>`;

    expect(sw.extractShellAssets(html).sort()).toEqual([
      "/_next/static/chunks/4567-def.js",
      "/_next/static/chunks/app/%28kid%29/friends/page-33cc.js",
      "/_next/static/chunks/app/%28kid%29/snapshots/page-11aa22.js",
      "/_next/static/css/abc123.css",
      "/_next/static/media/nunito-latin.woff2",
    ]);
  });

  it("dedupes prefixed and bare refs to the same asset", () => {
    const html = `<script src="/_next/static/chunks/main-app-9f.js"></script>
      <script>self.__next_f.push([1,"\\"static/chunks/main-app-9f.js\\""])</script>`;
    expect(sw.extractShellAssets(html)).toEqual([
      "/_next/static/chunks/main-app-9f.js",
    ]);
  });

  it("returns nothing for asset-free HTML", () => {
    expect(sw.extractShellAssets("<html><body>offline</body></html>")).toEqual([]);
  });
});
