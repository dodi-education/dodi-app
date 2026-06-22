import { describe, expect, it } from "vitest";

import {
  evaluateSuccess,
  isEmptyCriteria,
  mergeMetrics,
  SuccessCriteriaSchema,
  type MetricsSummary,
  type SuccessCriteria,
} from "./success";

// The worked example from the design:
// "3 calculations solved without asking Dodi, under 5 seconds each."
const MATH_CRITERIA: SuccessCriteria = {
  description: "Solve 3 calculations without asking Dodi, each under 5 seconds.",
  match: "all",
  conditions: [
    { metric: "correct", op: ">=", value: 3 },
    { metric: "hintsUsed", op: "==", value: 0 },
    { metric: "maxTaskMs", op: "<=", value: 5000 },
  ],
  requiredMetrics: ["correct", "hintsUsed", "maxTaskMs"],
};

describe("SuccessCriteriaSchema", () => {
  it("accepts the worked example", () => {
    expect(SuccessCriteriaSchema.safeParse(MATH_CRITERIA).success).toBe(true);
  });

  it("rejects an unknown metric key", () => {
    const bad = {
      ...MATH_CRITERIA,
      conditions: [{ metric: "bogus", op: ">=", value: 1 }],
    };
    expect(SuccessCriteriaSchema.safeParse(bad).success).toBe(false);
  });
});

describe("evaluateSuccess (match: all)", () => {
  it("succeeds when every condition is met", () => {
    const metrics: MetricsSummary = { correct: 3, hintsUsed: 0, maxTaskMs: 4200 };
    expect(evaluateSuccess(MATH_CRITERIA, metrics).succeeded).toBe(true);
  });

  it("fails when the child asked Dodi (hintsUsed > 0)", () => {
    const metrics: MetricsSummary = { correct: 3, hintsUsed: 1, maxTaskMs: 4200 };
    expect(evaluateSuccess(MATH_CRITERIA, metrics).succeeded).toBe(false);
  });

  it("fails when a single task was too slow", () => {
    const metrics: MetricsSummary = { correct: 3, hintsUsed: 0, maxTaskMs: 6000 };
    expect(evaluateSuccess(MATH_CRITERIA, metrics).succeeded).toBe(false);
  });

  it("fails when not enough are solved yet", () => {
    const metrics: MetricsSummary = { correct: 2, hintsUsed: 0, maxTaskMs: 3000 };
    const result = evaluateSuccess(MATH_CRITERIA, metrics);
    expect(result.succeeded).toBe(false);
    expect(result.conditions[0].met).toBe(false);
  });

  it("does not succeed while a required metric is unreported", () => {
    const metrics: MetricsSummary = { correct: 3, hintsUsed: 0 }; // maxTaskMs missing
    const result = evaluateSuccess(MATH_CRITERIA, metrics);
    expect(result.succeeded).toBe(false);
    expect(result.missingMetrics).toContain("maxTaskMs");
  });
});

describe("evaluateSuccess (match: any)", () => {
  const anyCriteria: SuccessCriteria = {
    description: "Either a long streak or a high score.",
    match: "any",
    conditions: [
      { metric: "streak", op: ">=", value: 5 },
      { metric: "score", op: ">=", value: 100 },
    ],
    requiredMetrics: [],
  };

  it("succeeds when at least one condition holds", () => {
    expect(evaluateSuccess(anyCriteria, { score: 120 }).succeeded).toBe(true);
    expect(evaluateSuccess(anyCriteria, { streak: 5 }).succeeded).toBe(true);
  });

  it("fails when no condition holds", () => {
    expect(evaluateSuccess(anyCriteria, { streak: 2, score: 40 }).succeeded).toBe(false);
  });
});

describe("isEmptyCriteria", () => {
  it("treats null / no-condition criteria as open play", () => {
    expect(isEmptyCriteria(null)).toBe(true);
    expect(
      isEmptyCriteria({ description: "", match: "all", conditions: [], requiredMetrics: [] }),
    ).toBe(true);
    expect(isEmptyCriteria(MATH_CRITERIA)).toBe(false);
  });

  it("never auto-succeeds on empty criteria", () => {
    const result = evaluateSuccess(null, { correct: 99 });
    expect(result.succeeded).toBe(false);
  });
});

describe("mergeMetrics", () => {
  it("injects host-observed Dodi turns as hintsUsed", () => {
    const merged = mergeMetrics({ correct: 3 }, { dodiTurns: 2 });
    expect(merged.hintsUsed).toBe(2);
  });

  it("takes the larger of game-reported hints and host Dodi turns", () => {
    expect(mergeMetrics({ hintsUsed: 3 }, { dodiTurns: 1 }).hintsUsed).toBe(3);
    expect(mergeMetrics({ hintsUsed: 1 }, { dodiTurns: 4 }).hintsUsed).toBe(4);
  });

  it("leaves metrics untouched when there are no host signals", () => {
    const merged = mergeMetrics({ correct: 2 });
    expect(merged.hintsUsed).toBeUndefined();
    expect(merged.correct).toBe(2);
  });

  it("turns a clean run + a Dodi question into a failed math goal", () => {
    // Child solved 3 fast, but asked Dodi once → host merges hintsUsed=1 → not success.
    const game: MetricsSummary = { correct: 3, hintsUsed: 0, maxTaskMs: 3000 };
    const merged = mergeMetrics(game, { dodiTurns: 1 });
    expect(evaluateSuccess(MATH_CRITERIA, merged).succeeded).toBe(false);
  });
});
