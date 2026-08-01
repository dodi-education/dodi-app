import { describe, expect, it } from "vitest";

import { buildPreviewPrompt, sanitizePreviewScene } from "./preview-prompt";

describe("sanitizePreviewScene", () => {
  it("collapses newlines and bounds the length", () => {
    expect(sanitizePreviewScene("a fox\njumping\r\nover hills")).toBe(
      "a fox jumping over hills",
    );
    expect(sanitizePreviewScene("x".repeat(500))).toHaveLength(400);
  });
});

describe("buildPreviewPrompt", () => {
  it("embeds the scene and always forbids text in the image", () => {
    const prompt = buildPreviewPrompt("a counting fox in a meadow");
    expect(prompt).toContain("a counting fox in a meadow");
    expect(prompt).toContain("square");
    expect(prompt).toContain("NO text");
  });

  it("falls back to a generic subject for an empty scene", () => {
    const prompt = buildPreviewPrompt("   ");
    expect(prompt).toContain("children's learning game");
  });

  it("mentions the style reference only when one is attached", () => {
    const withRef = buildPreviewPrompt("a fox", { hasStyleReference: true });
    const withoutRef = buildPreviewPrompt("a fox");
    expect(withRef).toContain("background scenery is attached");
    expect(withoutRef).not.toContain("attached");
  });
});
