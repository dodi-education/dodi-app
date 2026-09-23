import { describe, expect, it } from "vitest";

import { buildBackgroundPrompt } from "./background-prompt";

describe("buildBackgroundPrompt", () => {
  it("forbids painted placeholders for game pieces, whatever the scene", () => {
    const prompt = buildBackgroundPrompt("a sunny meadow with a clock tower in the distance");
    expect(prompt).toContain("a sunny meadow with a clock tower in the distance");
    expect(prompt).toMatch(/do NOT paint any frame, panel, plate/i);
    expect(prompt).toMatch(/do not reserve a blank space/i);
  });

  it("keeps the text-free rule and adds the perspective hint", () => {
    const prompt = buildBackgroundPrompt("a quiet beach", "side");
    expect(prompt).toMatch(/NO text of any kind/);
    expect(prompt).toMatch(/side-on/);
  });
});
