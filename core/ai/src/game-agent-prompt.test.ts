import { describe, expect, it } from "vitest";

import { buildAgentSystemPrompt } from "./game-agent-prompt";

const BASE = { language: "German", sourceLocale: "de" };

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

  it("with a narration language, instructs working-aloud status sentences in it", () => {
    const prompt = buildAgentSystemPrompt({ ...BASE, narrationLanguage: "German" });
    expect(prompt).toContain("## Working Aloud");
    expect(prompt).toContain("write ONE short plain-text sentence in German");
  });

  it("without a narration language, omits the working-aloud section", () => {
    expect(buildAgentSystemPrompt(BASE)).not.toContain("## Working Aloud");
    expect(buildAgentSystemPrompt({ ...BASE, narrationLanguage: "  " })).not.toContain(
      "## Working Aloud",
    );
  });

  it("requires the translations block with the child's source locale", () => {
    const prompt = buildAgentSystemPrompt(BASE);
    expect(prompt).toContain("## In-Game Text & Translations (REQUIRED)");
    expect(prompt).toContain('"sourceLocale":"de"');
    expect(prompt).toContain('dodi.translate("key", {param: value})');
    expect(prompt).toContain("exactly ONE inert translations block");
  });

  it("teaches the generate_text content-slot convention", () => {
    const prompt = buildAgentSystemPrompt(BASE);
    expect(prompt).toContain("generate_text");
    expect(prompt).toContain("state.contentSlots");
    expect(prompt).toContain("set_generated_text");
    expect(prompt).toContain("request_generate_text");
    expect(prompt).toContain("NEVER put undefined in state");
  });

  it("teaches the generate_voice spoken-feedback convention", () => {
    const prompt = buildAgentSystemPrompt(BASE);
    expect(prompt).toContain("generate_voice");
    expect(prompt).toContain("request_generate_voice");
    expect(prompt).toContain("set_generated_voice");
  });
});
