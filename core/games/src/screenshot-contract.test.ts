import { describe, expect, it } from "vitest";

import {
  DEFAULT_GAME_SCREENSHOT_SERVICE,
  DEFAULT_SCREENSHOT_VIEWPORT,
  GameScreenshotServiceSettingsSchema,
  isAllowedCustomServiceUrl,
  parseGameScreenshotServiceSettings,
  SCREENSHOT_LIMITS,
  ScreenshotRequestSchema,
  ScreenshotResponseSchema,
} from "./screenshot-contract";
import { STAGE } from "./stage";

const JPEG = "data:image/jpeg;base64,/9j/4AAQ";

describe("ScreenshotRequestSchema", () => {
  it("accepts a minimal request and the full shape", () => {
    expect(ScreenshotRequestSchema.safeParse({ version: 1, document: "<html>" }).success).toBe(true);
    const full = ScreenshotRequestSchema.safeParse({
      version: 1,
      document: "<html>",
      viewport: DEFAULT_SCREENSHOT_VIEWPORT,
      locale: "de",
      settleMs: 600,
      steps: [
        { label: "first answer", command: { type: "submit_answer", payload: { answer: "3" } } },
        { label: "wait", waitMs: 200 },
      ],
    });
    expect(full.success).toBe(true);
  });

  it("the default viewport is the stage size", () => {
    expect(DEFAULT_SCREENSHOT_VIEWPORT).toEqual({
      width: STAGE.logicalWidth,
      height: STAGE.logicalHeight,
    });
  });

  it("rejects an unknown version, an empty document, and too many steps", () => {
    expect(ScreenshotRequestSchema.safeParse({ version: 2, document: "x" }).success).toBe(false);
    expect(ScreenshotRequestSchema.safeParse({ version: 1, document: "" }).success).toBe(false);
    const steps = Array.from({ length: SCREENSHOT_LIMITS.MAX_STEPS + 1 }, (_, i) => ({
      label: `s${i}`,
    }));
    expect(ScreenshotRequestSchema.safeParse({ version: 1, document: "x", steps }).success).toBe(
      false,
    );
  });

  it("bounds the viewport and the waits", () => {
    const bad = (patch: Record<string, unknown>) =>
      ScreenshotRequestSchema.safeParse({ version: 1, document: "x", ...patch }).success;
    expect(bad({ viewport: { width: 100, height: 720 } })).toBe(false);
    expect(bad({ viewport: { width: 576, height: 4000 } })).toBe(false);
    expect(bad({ settleMs: SCREENSHOT_LIMITS.MAX_SETTLE_MS + 1 })).toBe(false);
    expect(bad({ steps: [{ label: "s", waitMs: SCREENSHOT_LIMITS.MAX_STEP_WAIT_MS + 1 }] })).toBe(
      false,
    );
  });
});

describe("ScreenshotResponseSchema", () => {
  const ok = { version: 1, frames: [{ label: "initial", image: JPEG }], ready: true, warnings: [], errors: [] };

  it("accepts a well-formed reply", () => {
    expect(ScreenshotResponseSchema.safeParse(ok).success).toBe(true);
  });

  it("only accepts base64 image data URLs as frames (a custom service is untrusted)", () => {
    const withFrame = (image: string) =>
      ScreenshotResponseSchema.safeParse({ ...ok, frames: [{ label: "initial", image }] }).success;
    expect(withFrame("https://evil.example/x.png")).toBe(false);
    expect(withFrame("data:text/html;base64,PGh0bWw+")).toBe(false);
    expect(withFrame("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(withFrame("data:image/png;base64,iVBORw0KGgo=")).toBe(true);
  });

  it("caps frames and notes", () => {
    const frames = Array.from({ length: SCREENSHOT_LIMITS.MAX_FRAMES + 1 }, () => ({
      label: "f",
      image: JPEG,
    }));
    expect(ScreenshotResponseSchema.safeParse({ ...ok, frames }).success).toBe(false);
    const errors = Array.from({ length: SCREENSHOT_LIMITS.MAX_ERRORS + 1 }, () => "boom");
    expect(ScreenshotResponseSchema.safeParse({ ...ok, errors }).success).toBe(false);
    const longNote = "x".repeat(SCREENSHOT_LIMITS.MAX_ERROR_CHARS + 1);
    expect(ScreenshotResponseSchema.safeParse({ ...ok, warnings: [longNote] }).success).toBe(false);
  });

  it("takes optional, capped layout issues (older services omit them)", () => {
    const issue = 'div.clock covers div.progress (284×14 px at 160,120), frame 1 (initial)';
    const parsed = ScreenshotResponseSchema.safeParse({ ...ok, layoutIssues: [issue] });
    expect(parsed.success && parsed.data.layoutIssues).toEqual([issue]);
    expect(ScreenshotResponseSchema.safeParse(ok).success).toBe(true);
    const tooMany = Array.from({ length: SCREENSHOT_LIMITS.MAX_LAYOUT_ISSUES + 1 }, () => issue);
    expect(ScreenshotResponseSchema.safeParse({ ...ok, layoutIssues: tooMany }).success).toBe(false);
  });
});

describe("GameScreenshotServiceSettingsSchema", () => {
  it("accepts every mode, requiring a sealed URL only for custom", () => {
    expect(GameScreenshotServiceSettingsSchema.safeParse({ mode: "off" }).success).toBe(true);
    expect(GameScreenshotServiceSettingsSchema.safeParse({ mode: "dodi" }).success).toBe(true);
    expect(GameScreenshotServiceSettingsSchema.safeParse({ mode: "custom" }).success).toBe(false);
    expect(
      GameScreenshotServiceSettingsSchema.safeParse({ mode: "custom", customUrlEnc: "enc:v1:abc" })
        .success,
    ).toBe(true);
  });

  it("refuses a plaintext URL where the sealed one belongs", () => {
    expect(
      GameScreenshotServiceSettingsSchema.safeParse({
        mode: "custom",
        customUrlEnc: "https://example.com/render",
      }).success,
    ).toBe(false);
  });

  it("parses defensively, falling back to the default (dodi)", () => {
    expect(parseGameScreenshotServiceSettings(null)).toEqual(DEFAULT_GAME_SCREENSHOT_SERVICE);
    expect(parseGameScreenshotServiceSettings({ mode: "nope" })).toEqual(
      DEFAULT_GAME_SCREENSHOT_SERVICE,
    );
    expect(parseGameScreenshotServiceSettings({ mode: "off" })).toEqual({ mode: "off" });
  });
});

describe("isAllowedCustomServiceUrl", () => {
  it("allows https anywhere and http only on loopback", () => {
    expect(isAllowedCustomServiceUrl("https://shots.example.com/render")).toBe(true);
    expect(isAllowedCustomServiceUrl("http://localhost:3006/render")).toBe(true);
    expect(isAllowedCustomServiceUrl("http://127.0.0.1:3006/render")).toBe(true);
    expect(isAllowedCustomServiceUrl("http://[::1]:3006/render")).toBe(true);
    expect(isAllowedCustomServiceUrl("http://shots.example.com/render")).toBe(false);
  });

  it("refuses credentials, fragments, other schemes and garbage", () => {
    expect(isAllowedCustomServiceUrl("https://user:pw@shots.example.com/render")).toBe(false);
    expect(isAllowedCustomServiceUrl("https://shots.example.com/render#x")).toBe(false);
    expect(isAllowedCustomServiceUrl("ftp://shots.example.com/render")).toBe(false);
    expect(isAllowedCustomServiceUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedCustomServiceUrl("not a url")).toBe(false);
  });
});
