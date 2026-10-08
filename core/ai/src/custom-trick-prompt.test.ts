import { describe, expect, it } from "vitest";

import { CHARACTER_MODELS, type CharacterModel } from "@dodi/character/character-catalog";

import { buildCustomTrickInstruction, buildCustomTrickPrompt } from "./custom-trick-prompt";

describe("custom trick prompt", () => {
  it("describes exactly the avatar's bones, its face states and the kid's language", () => {
    const instruction = buildCustomTrickInstruction(CHARACTER_MODELS.dodi, "German");
    for (const bone of CHARACTER_MODELS.dodi.bones) expect(instruction).toContain(`- ${bone}:`);
    expect(instruction).not.toContain("- arm_L:");
    expect(instruction).toContain("happy");
    expect(instruction).toContain("in German");
    expect(instruction).toContain("reserved for speech");
  });

  it("offers only the bones a different rig has", () => {
    const robot: CharacterModel = { ...CHARACTER_MODELS.dodi, bones: ["root", "body", "head", "arm_L", "arm_R"] };
    const instruction = buildCustomTrickInstruction(robot, "English");
    expect(instruction).toContain("- arm_R:");
    expect(instruction).not.toContain("- wing_L:");
  });

  it("includes built-in tricks as examples", () => {
    expect(buildCustomTrickInstruction(CHARACTER_MODELS.dodi, "English")).toContain('"name":"Pirouette"');
  });

  it("asks again with the issues of the last try", () => {
    expect(buildCustomTrickPrompt("  a bow ")).toBe('The child asks: "a bow"');
    const retry = buildCustomTrickPrompt("a bow", ["poses.0.t: pose times must increase"]);
    expect(retry).toContain("- poses.0.t: pose times must increase");
  });
});
