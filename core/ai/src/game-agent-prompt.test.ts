import { describe, expect, it } from "vitest";

import { buildAgentSystemPrompt } from "./game-agent-prompt";

const BASE = { language: "German" };

describe("buildAgentSystemPrompt", () => {
  it("injects the visual design language quality floor", () => {
    const prompt = buildAgentSystemPrompt(BASE);
    expect(prompt).toContain("Visual Design Language (QUALITY FLOOR — REQUIRED)");
    expect(prompt).toContain("Follow the Visual Design Language above");
    expect(prompt).not.toContain("Colorful, engaging visual design");
  });

  it("without a perspective, tells the agent to choose one", () => {
    const prompt = buildAgentSystemPrompt(BASE);
    expect(prompt).toContain("choose one, then commit");
    expect(prompt).not.toContain("REQUIRED PERSPECTIVE:");
  });

  it("with a perspective, makes it a hard requirement", () => {
    const prompt = buildAgentSystemPrompt({ ...BASE, perspective: "isometric" });
    expect(prompt).toContain("REQUIRED PERSPECTIVE: Isometric 2.5D");
    expect(prompt).toContain("Perspective: Isometric 2.5D — REQUIRED");
    expect(prompt).not.toContain("choose one, then commit");
  });
});
