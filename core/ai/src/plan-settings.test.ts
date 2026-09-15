import { describe, expect, it, vi } from "vitest";

import { coercePlanSettings, derivePlanSettings } from "./plan-settings";

const generateJson = vi.fn();
vi.mock("./client-thinking", () => ({
  createClientThinkingProvider: (...args: unknown[]) => {
    factoryArgs = args;
    return { generateJson, generateText: vi.fn() };
  },
}));

let factoryArgs: unknown[] = [];

const CTX = { language: "English", defaultAgeMin: 4, defaultAgeMax: 12 };

describe("coercePlanSettings", () => {
  it("keeps a well-formed response intact", () => {
    expect(
      coercePlanSettings(
        {
          title: "Apple Counter",
          learningGoal: "Practise counting to twenty.",
          successDefinition: "counts 10 baskets correctly",
          tags: ["numbers", "math"],
          targetAgeMin: 5,
          targetAgeMax: 7,
          perspective: "side",
        },
        CTX,
      ),
    ).toEqual({
      title: "Apple Counter",
      learningGoal: "Practise counting to twenty.",
      successDefinition: "counts 10 baskets correctly",
      tags: ["numbers", "math"],
      targetAgeMin: 5,
      targetAgeMax: 7,
      perspective: "side",
    });
  });

  it("drops tags outside the catalog and de-duplicates the rest", () => {
    const s = coercePlanSettings({ tags: ["math", "math", "quantum-physics", 7] }, CTX);
    expect(s.tags).toEqual(["math"]);
  });

  it("returns no tags when the model sends something that is not a list", () => {
    expect(coercePlanSettings({ tags: "math" }, CTX).tags).toEqual([]);
  });

  it("clamps ages into the form's range and swaps an inverted pair", () => {
    const s = coercePlanSettings({ targetAgeMin: 40, targetAgeMax: 0 }, CTX);
    // 40 → 25, 0 → 1, then swapped so min <= max.
    expect([s.targetAgeMin, s.targetAgeMax]).toEqual([1, 25]);
  });

  it("falls back to the form's current range when ages are missing or fractional", () => {
    expect(coercePlanSettings({}, CTX).targetAgeMin).toBe(4);
    expect(coercePlanSettings({}, CTX).targetAgeMax).toBe(12);
    const fractional = coercePlanSettings({ targetAgeMin: 5.5, targetAgeMax: 8.2 }, CTX);
    expect([fractional.targetAgeMin, fractional.targetAgeMax]).toEqual([4, 12]);
  });

  it("mirrors a single valid bound onto the other", () => {
    const s = coercePlanSettings({ targetAgeMin: 6 }, CTX);
    expect([s.targetAgeMin, s.targetAgeMax]).toEqual([6, 6]);
  });

  it("rejects an unknown perspective", () => {
    expect(coercePlanSettings({ perspective: "first-person" }, CTX).perspective).toBeNull();
    expect(coercePlanSettings({ perspective: "isometric" }, CTX).perspective).toBe("isometric");
  });

  it("trims strings, cuts an overlong title, and blanks non-strings", () => {
    const s = coercePlanSettings(
      { title: `  ${"x".repeat(80)}  `, learningGoal: "  count  ", successDefinition: 42 },
      CTX,
    );
    expect(s.title).toHaveLength(60);
    expect(s.learningGoal).toBe("count");
    expect(s.successDefinition).toBe("");
  });
});

describe("derivePlanSettings", () => {
  it("prompts with the plan and the tag catalog, and forwards usage", async () => {
    generateJson.mockResolvedValueOnce({ title: "Shape Sorter", tags: ["reasoning"] });
    const onUsage = vi.fn();

    const settings = await derivePlanSettings(
      { providerId: "anthropic", modelId: "claude-opus-4-8", apiKey: "secret" },
      "**Goal**\n- sort shapes",
      { ...CTX, kidAge: 6 },
      onUsage,
    );

    expect(settings.title).toBe("Shape Sorter");
    expect(settings.tags).toEqual(["reasoning"]);
    const [system, prompt] = generateJson.mock.calls[0] as [string, string];
    expect(system).toContain("reasoning");
    expect(system).toContain("The child is 6");
    expect(prompt).toContain("sort shapes");
    expect(factoryArgs).toEqual(["anthropic", "secret", "claude-opus-4-8", onUsage]);
  });
});
