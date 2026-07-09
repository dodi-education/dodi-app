import { describe, expect, it } from "vitest";

import {
  buildDrawingPrompt,
  buildMandalaSheetPrompt,
  buildPictureSheetPrompt,
  sanitizeDrawingSubject,
} from "./coloring-prompt";

describe("buildPictureSheetPrompt", () => {
  it("includes the requested subject", () => {
    expect(buildPictureSheetPrompt("owl")).toContain("owl");
  });

  it("forces a flat black-and-white coloring page, not a photo", () => {
    const prompt = buildPictureSheetPrompt("dragon").toLowerCase();
    expect(prompt).toContain("black-and-white");
    expect(prompt).toContain("coloring page");
    expect(prompt).toContain("no photorealism");
    expect(prompt).toContain("no color");
    expect(prompt).toContain("no shading");
  });

  it("explicitly steers away from mandala styling", () => {
    expect(buildPictureSheetPrompt("owl").toLowerCase()).toContain("not a mandala");
  });

  it("falls back to a safe subject when given only whitespace", () => {
    expect(buildPictureSheetPrompt("   ")).toContain("a friendly animal");
  });
});

describe("buildMandalaSheetPrompt", () => {
  it("includes the requested subject", () => {
    expect(buildMandalaSheetPrompt("owl")).toContain("owl");
  });

  it("forces a flat black-and-white mandala coloring sheet, not a photo", () => {
    const prompt = buildMandalaSheetPrompt("dragon").toLowerCase();
    expect(prompt).toContain("black-and-white");
    expect(prompt).toContain("coloring sheet");
    expect(prompt).toContain("mandala");
    expect(prompt).toContain("no photorealism");
    expect(prompt).toContain("no color");
    expect(prompt).toContain("no shading");
  });

  it("falls back to a safe subject when given only whitespace", () => {
    expect(buildMandalaSheetPrompt("   ")).toContain("a friendly animal");
  });
});

describe("buildDrawingPrompt", () => {
  it("routes 'mandala' to the mandala builder", () => {
    expect(buildDrawingPrompt("owl", "mandala")).toBe(buildMandalaSheetPrompt("owl"));
  });

  it("routes 'picture' to the plain-picture builder", () => {
    expect(buildDrawingPrompt("owl", "picture")).toBe(buildPictureSheetPrompt("owl"));
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
