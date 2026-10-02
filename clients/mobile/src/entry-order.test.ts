import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The polyfills (crypto.getRandomValues above all) must run before any other
 * module. @noble reads `globalThis.crypto` once, when it loads; Expo Router
 * loads route files (which import the vault, hence @noble) before the root
 * _layout, so a polyfill imported there came too late. On a Pixel 10 every
 * encrypted write failed with "crypto.getRandomValues must be defined"
 * (snapshot saves, autosaves) while decryption, which needs no randomness,
 * kept working.
 */
const appRoot = resolve(__dirname, "..");

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/^\s*import\s+(?:[^"';]+\s+from\s+)?["']([^"']+)["']/gm)].map((m) => m[1]);
}

describe("app entry", () => {
  it("runs the polyfills before Expo Router loads any route", () => {
    const pkg = JSON.parse(readFileSync(resolve(appRoot, "package.json"), "utf8")) as { main: string };
    expect(pkg.main).not.toBe("expo-router/entry");

    const entry = readFileSync(resolve(appRoot, pkg.main), "utf8");
    const imports = importSpecifiers(entry);
    const polyfills = imports.findIndex((s) => /(^|\/)polyfills$/.test(s));
    const router = imports.indexOf("expo-router/entry");
    expect(polyfills).toBe(0);
    expect(router).toBeGreaterThan(polyfills);
  });
});
