import { describe, expect, it } from "vitest";

import { buildSandboxSrcDoc } from "./game-sandbox";

const BUNDLE = [
  "<!doctype html>",
  "<html><head><title>g</title></head><body>",
  "<div id='game'></div>",
  "<script>console.log('game')</script>",
  "</body></html>",
].join("\n");

describe("buildSandboxSrcDoc", () => {
  it("injects the CSP meta into the head", () => {
    const doc = buildSandboxSrcDoc(BUNDLE);
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("connect-src 'none'");
  });

  it("injects the host shim before the first game script", () => {
    const doc = buildSandboxSrcDoc(BUNDLE);
    const shimIdx = doc.indexOf("dodi:host_snapshot");
    const gameScriptIdx = doc.indexOf("console.log('game')");
    expect(shimIdx).toBeGreaterThan(-1);
    expect(gameScriptIdx).toBeGreaterThan(-1);
    expect(shimIdx).toBeLessThan(gameScriptIdx);
    // The shim answers on the standard game:event channel.
    expect(doc).toContain("host_snapshot");
    expect(doc).toContain("foreignObject");
  });

  it("wraps bare fragments in a full document with the CSP", () => {
    const doc = buildSandboxSrcDoc("<div>hi</div>");
    expect(doc).toContain("<!doctype html>");
    expect(doc).toContain("Content-Security-Policy");
    expect(doc).toContain("dodi:host_snapshot");
  });
});
