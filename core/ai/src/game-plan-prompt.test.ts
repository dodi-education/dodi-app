import { describe, expect, it } from "vitest";

import { buildPlanSystemPrompt } from "./game-plan-prompt";

const BASE = { language: "German", replyLanguage: "English" };

describe("buildPlanSystemPrompt", () => {
  it("writes the reply language into the talking rules and the plan format", () => {
    const prompt = buildPlanSystemPrompt({ ...BASE, age: 7 });
    expect(prompt).toContain("Reply in English");
    expect(prompt).toContain("Write the summary in English");
    // The game itself is still in the child's language.
    expect(prompt).toContain("The game will be played in: German");
    expect(prompt).toContain("Child's age: 7 years old");
  });

  it("says the age is unknown rather than omitting it", () => {
    expect(buildPlanSystemPrompt(BASE)).toContain("Child's age: unknown");
  });

  it("keeps the agent out of implementation territory", () => {
    const prompt = buildPlanSystemPrompt(BASE);
    expect(prompt).toContain("Never write or show code");
    expect(prompt).toContain("propose_plan");
  });

  it("forbids personalizing with the child's identity", () => {
    const prompt = buildPlanSystemPrompt(BASE);
    expect(prompt).toContain("NEVER personalize with private data");
    expect(prompt).toContain('Say "your child" instead');
  });

  it("includes the learning context when there is one", () => {
    const prompt = buildPlanSystemPrompt({
      ...BASE,
      learningContext: "Learning memory: loves dinosaurs",
    });
    expect(prompt).toContain("loves dinosaurs");
    expect(prompt).toContain("this is what you personalize it");
  });

  it("tells the agent to ask when no learning context exists", () => {
    const prompt = buildPlanSystemPrompt(BASE);
    expect(prompt).toContain("No learning notes are available");
    expect(prompt).not.toContain("Learning memory:");
  });

  it("echoes the plan under discussion and demands a full rewrite", () => {
    const prompt = buildPlanSystemPrompt({ ...BASE, currentPlan: "**Goal**\n- count apples" });
    expect(prompt).toContain("count apples");
    expect(prompt).toContain("COMPLETE revised summary");
  });

  it("omits the plan section before the first proposal", () => {
    expect(buildPlanSystemPrompt(BASE)).not.toContain("The Plan Currently On The Table");
  });

  it("explains how to read a photo of a task", () => {
    const prompt = buildPlanSystemPrompt(BASE);
    expect(prompt).toContain("Photos And Sketches");
    expect(prompt).toContain("Never copy text out of an image");
  });
});
