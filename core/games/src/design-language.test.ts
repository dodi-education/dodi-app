import { describe, expect, it } from "vitest";

import { designLanguageDoc, PERSPECTIVE_LABELS } from "./design-language";

describe("designLanguageDoc", () => {
  it("always contains the quality-floor sections", () => {
    const doc = designLanguageDoc();
    expect(doc).toContain("Visual Design Language (QUALITY FLOOR — REQUIRED)");
    expect(doc).toContain("BANNED");
    expect(doc).toContain("REQUIRED DEPTH & MATERIALS");
    expect(doc).toContain("TYPOGRAPHY");
    expect(doc).toContain("prefers-reduced-motion");
  });

  it("bans text baked into artwork (translatability rule)", () => {
    expect(designLanguageDoc()).toContain("Baking text, letters, or numbers");
  });

  it("bans invented letterform geometry and routes tracing through read_char_paths", () => {
    const doc = designLanguageDoc();
    expect(doc).toContain("Hand-drawing letters or numbers as SVG/canvas paths");
    expect(doc).toContain("LETTERS, NUMBERS & TRACING MECHANICS");
    expect(doc).toContain("read_char_paths");
    expect(doc).toContain("NEVER invent stroke geometry");
    expect(doc).toContain("getImageData");
  });

  it("includes concrete CSS recipes", () => {
    const doc = designLanguageDoc();
    expect(doc).toContain("linear-gradient");
    expect(doc).toContain("box-shadow");
    expect(doc).toContain("text-shadow");
    expect(doc).toContain("@keyframes float");
    expect(doc).toContain("@keyframes pop");
  });

  it("unspecified perspective → chooser section mentioning all three", () => {
    for (const doc of [designLanguageDoc(), designLanguageDoc(null)]) {
      expect(doc).toContain("choose one, then commit");
      expect(doc).toContain("Bird's eye");
      expect(doc).toContain("Side-on");
      expect(doc).toContain("Isometric 2.5D");
    }
  });

  it.each([
    ["bird", "DIRECTLY BENEATH"],
    ["side", "parallax"],
    ["isometric", "do NOT tilt the whole game"],
  ] as const)("perspective %s → dedicated REQUIRED section", (perspective, marker) => {
    const doc = designLanguageDoc(perspective);
    expect(doc).toContain(`Perspective: ${PERSPECTIVE_LABELS[perspective]} — REQUIRED`);
    expect(doc).toContain(marker);
    expect(doc).not.toContain("choose one, then commit");
  });

  it("isometric guidance is illustration-first, tilt restricted to tile grids", () => {
    const doc = designLanguageDoc("isometric");
    expect(doc).toContain("ELLIPSES");
    expect(doc).toContain("TILE");
    expect(doc).toContain("counter-rotate");
    expect(doc).toContain("44x44 px measured AFTER the transform");
  });

  it("perspective branches differ from each other", () => {
    const docs = (["bird", "side", "isometric"] as const).map((p) => designLanguageDoc(p));
    expect(new Set(docs).size).toBe(3);
  });
});
