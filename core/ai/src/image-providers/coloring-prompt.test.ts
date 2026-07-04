import { describe, expect, it } from "vitest";

import {
  buildColoringSheetPrompt,
  sanitizeDrawingSubject,
} from "./coloring-prompt";

describe("buildColoringSheetPrompt", () => {
  it("includes the requested subject", () => {
    expect(buildColoringSheetPrompt("owl")).toContain("owl");
  });

  it("forces a flat black-and-white coloring sheet, not a photo", () => {
    const prompt = buildColoringSheetPrompt("dragon").toLowerCase();
    expect(prompt).toContain("black-and-white");
    expect(prompt).toContain("coloring sheet");
    expect(prompt).toContain("mandala");
    expect(prompt).toContain("no photorealism");
    expect(prompt).toContain("no color");
    expect(prompt).toContain("no shading");
  });

  it("falls back to a safe subject when given only whitespace", () => {
    expect(buildColoringSheetPrompt("   ")).toContain("a friendly animal");
  });
});

describe("sanitizeDrawingSubject", () => {
  it("strips newlines and trims", () => {
    expect(sanitizeDrawingSubject("  a happy\nfox  ")).toBe("a happy fox");
  });

  it("caps the length", () => {
    expect(sanitizeDrawingSubject("x".repeat(200))).toHaveLength(80);
  });
});
