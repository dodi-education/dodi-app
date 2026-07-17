import { describe, expect, it } from "vitest";

import { assertSafeGameBundle, getGameBundleLimitBytes, sanitizeGameBundle } from "./sanitizer";

describe("bundle size cap", () => {
  it("allows bundles with inline background images up to 512KB", () => {
    expect(getGameBundleLimitBytes()).toBe(512 * 1024);
    const nearLimit = "a".repeat(512 * 1024 - 10);
    expect(() => assertSafeGameBundle(nearLimit)).not.toThrow();
  });

  it("rejects bundles over the stored cap", () => {
    const over = "a".repeat(512 * 1024 + 1);
    expect(() => assertSafeGameBundle(over)).toThrow(/maximum size/);
  });
});

describe("blocked patterns", () => {
  it.each([
    ['<script src="https://evil.example/x.js"></script>', /External script/],
    ["fetch('https://x')", /fetch/],
    ["new XMLHttpRequest()", /XMLHttpRequest/],
    ["new WebSocket('wss://x')", /WebSocket/],
    ["import('mod')", /Dynamic import/],
    ["navigator.sendBeacon('/x')", /sendBeacon/],
    ["document.cookie", /cookie/],
  ])("rejects %s", (code, reason) => {
    expect(() => assertSafeGameBundle(code)).toThrow(reason);
  });

  it("accepts a clean bundle and trims it", () => {
    const { code, sizeBytes } = sanitizeGameBundle("  <html><body>ok</body></html>  ");
    expect(code).toBe("<html><body>ok</body></html>");
    expect(sizeBytes).toBe(code.length);
  });
});
