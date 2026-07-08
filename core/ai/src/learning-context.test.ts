import { describe, expect, it } from "vitest";

import {
  buildLearningContext,
  LEARNING_CONTEXT_CHARS_PER_KID,
  LEARNING_CONTEXT_MAX_TOTAL_CHARS,
  type LearningContextKid,
} from "./learning-context";

const alice: LearningContextKid = {
  id: "a",
  memory: "Alice loves dinosaurs.",
  parent_notes: "Bedtime at 8pm.",
};
const bob: LearningContextKid = {
  id: "b",
  memory: "Bob is into space.",
  parent_notes: null,
};
const empty: LearningContextKid = { id: "c", memory: "", parent_notes: null };

describe("buildLearningContext", () => {
  it("returns a single block (no ### Child header) for one kid", () => {
    const out = buildLearningContext([alice, bob], undefined, "a");
    expect(out).toContain("Learning memory:\nAlice loves dinosaurs.");
    expect(out).toContain("Parent notes:\nBedtime at 8pm.");
    expect(out).not.toContain("### Child");
    // Default scope (no audience) selects only the primary kid.
    expect(out).not.toContain("space");
  });

  it("includes only the specified audienceIds", () => {
    const out = buildLearningContext(
      [alice, bob],
      { isFamily: false, audienceIds: ["b"] },
      "a",
    );
    expect(out).toContain("Bob is into space.");
    expect(out).not.toContain("dinosaurs");
  });

  it("uses ### Child N headers for a multi-kid family scope", () => {
    const out = buildLearningContext(
      [alice, bob],
      { isFamily: true, audienceIds: [] },
      "a",
    );
    expect(out).toContain("### Child 1");
    expect(out).toContain("### Child 2");
    expect(out).toContain("dinosaurs");
    expect(out).toContain("space");
  });

  it("skips kids with no memory or notes", () => {
    const out = buildLearningContext(
      [alice, empty],
      { isFamily: true, audienceIds: [] },
      "a",
    );
    // Only one kid has content → single block, no headers.
    expect(out).not.toContain("### Child");
    expect(out).toContain("dinosaurs");
  });

  it("returns undefined when no selected kid has content", () => {
    expect(
      buildLearningContext([empty], { isFamily: true, audienceIds: [] }, "c"),
    ).toBeUndefined();
    expect(buildLearningContext([], undefined, "x")).toBeUndefined();
  });

  it("clips each field to the per-kid cap", () => {
    const long = "x".repeat(LEARNING_CONTEXT_CHARS_PER_KID + 500);
    const out = buildLearningContext(
      [{ id: "a", memory: long, parent_notes: null }],
      undefined,
      "a",
    );
    expect(out).toContain("…");
    // Clipped body is exactly the cap length (plus the ellipsis).
    expect(out).toContain("x".repeat(LEARNING_CONTEXT_CHARS_PER_KID));
    expect(out).not.toContain("x".repeat(LEARNING_CONTEXT_CHARS_PER_KID + 1));
  });

  it("caps the total assembled context across many family kids", () => {
    const kids: LearningContextKid[] = Array.from({ length: 10 }, (_, i) => ({
      id: `k${i}`,
      memory: "m".repeat(LEARNING_CONTEXT_CHARS_PER_KID),
      parent_notes: null,
    }));
    const out = buildLearningContext(kids, { isFamily: true, audienceIds: [] }, "k0");
    expect(out).toBeDefined();
    // clip() adds a single "…" when it truncates, so cap + 1 is the ceiling.
    expect(out!.length).toBeLessThanOrEqual(LEARNING_CONTEXT_MAX_TOTAL_CHARS + 1);
    expect(out).toContain("…");
  });
});
