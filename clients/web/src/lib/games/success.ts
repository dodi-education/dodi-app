/**
 * Standardized progress & success system for Dodi games.
 *
 * This is the single source of truth for the metric vocabulary, the structured
 * success-criteria format, and the host-side evaluator. A game reports a small
 * set of standardized metrics through the bridge; the host evaluates the stored
 * criteria against those metrics (augmented with host-observed signals such as
 * how many times the child asked Dodi for help).
 *
 * Design philosophy: AI maps a parent's plain-language success definition onto
 * the structured `SuccessCriteria` below, and the (future) challenge engine
 * reasons over the same finite metric vocabulary.
 */

import { z } from "zod/v4";

/** Whether a game has a measurable objective (`goal`) or is open-ended (`open`). */
export type ProgressKind = "goal" | "open";

/**
 * The standardized metric vocabulary. A game may report any subset of these via
 * the reserved `dodi.metrics` object in its state and `game:progress` events.
 * Success criteria conditions reference these keys only — game-specific values
 * live under `metrics.custom` and are not used for evaluation.
 */
export type MetricKey =
  | "correct"
  | "incorrect"
  | "attempts"
  | "accuracy" // 0..1
  | "streak"
  | "score"
  | "hintsUsed"
  | "itemsCompleted"
  | "itemsTotal"
  | "elapsedMs"
  | "maxTaskMs"
  | "avgTaskMs";

export const METRIC_KEYS: readonly MetricKey[] = [
  "correct",
  "incorrect",
  "attempts",
  "accuracy",
  "streak",
  "score",
  "hintsUsed",
  "itemsCompleted",
  "itemsTotal",
  "elapsedMs",
  "maxTaskMs",
  "avgTaskMs",
] as const;

/** Human/AI-readable description of each metric, surfaced to the model in prompts. */
export const METRIC_VOCABULARY: Record<MetricKey, string> = {
  correct: "Count of correct answers / successful actions.",
  incorrect: "Count of incorrect answers / mistakes.",
  attempts: "Total attempts made (correct + incorrect).",
  accuracy: "Fraction correct, 0..1.",
  streak: "Current run of consecutive correct answers.",
  score: "Game-defined points score.",
  hintsUsed:
    "Times the child asked for help — includes asking Dodi (counted by the host) and any in-game hint.",
  itemsCompleted: "Count of discrete items/levels/tasks completed.",
  itemsTotal: "Total number of items/levels/tasks in the game.",
  elapsedMs: "Total elapsed play time in milliseconds.",
  maxTaskMs: "Longest single-task time in milliseconds (e.g. slowest answer).",
  avgTaskMs: "Average per-task time in milliseconds.",
};

export type Comparator = ">=" | ">" | "<=" | "<" | "==" | "!=";

export const COMPARATORS: readonly Comparator[] = [
  ">=",
  ">",
  "<=",
  "<",
  "==",
  "!=",
] as const;

export interface Condition {
  metric: MetricKey;
  op: Comparator;
  value: number;
}

export interface SuccessCriteria {
  /** Echoes the parent's plain-language success definition. */
  description: string;
  /** `all` = every condition must hold (AND); `any` = at least one (OR). */
  match: "all" | "any";
  conditions: Condition[];
  /** Metrics the game MUST report for the criteria to be evaluable. */
  requiredMetrics: MetricKey[];
}

/**
 * A reported metrics object. Standard keys are partial numbers; `custom` holds
 * game-specific numeric values that are displayed but never evaluated.
 */
export type MetricsSummary = Partial<Record<MetricKey, number>> & {
  custom?: Record<string, number>;
};

/** Reserved namespaced sub-object games place inside their state / progress events. */
export interface DodiProgressState {
  progressKind: ProgressKind;
  /** Completion toward the goal, 0..1. */
  progress: number;
  /** Optional human-readable progress label, e.g. "2 of 3 solved". */
  progressLabel?: string;
  metrics: MetricsSummary;
}

// ---------------------------------------------------------------------------
// Zod schemas (used by the bridge parser and generation validator)
// ---------------------------------------------------------------------------

export const MetricKeySchema = z.enum(
  METRIC_KEYS as unknown as [MetricKey, ...MetricKey[]],
);

export const ComparatorSchema = z.enum(
  COMPARATORS as unknown as [Comparator, ...Comparator[]],
);

export const ConditionSchema = z.object({
  metric: MetricKeySchema,
  op: ComparatorSchema,
  value: z.number(),
});

export const SuccessCriteriaSchema = z.object({
  description: z.string(),
  match: z.enum(["all", "any"]),
  conditions: z.array(ConditionSchema),
  requiredMetrics: z.array(MetricKeySchema),
});

export const MetricsSummarySchema = z
  .object({ custom: z.record(z.string(), z.number()).optional() })
  .catchall(z.number().optional());

export const DodiProgressStateSchema = z.object({
  progressKind: z.enum(["goal", "open"]),
  progress: z.number().min(0).max(1),
  progressLabel: z.string().optional(),
  metrics: MetricsSummarySchema,
});

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface ConditionResult {
  condition: Condition;
  /** The actual metric value, or undefined if the game has not reported it. */
  actual: number | undefined;
  met: boolean;
}

export interface SuccessEvaluation {
  succeeded: boolean;
  conditions: ConditionResult[];
  /** Required metrics the game has not reported yet. */
  missingMetrics: MetricKey[];
}

function compare(actual: number, op: Comparator, value: number): boolean {
  switch (op) {
    case ">=":
      return actual >= value;
    case ">":
      return actual > value;
    case "<=":
      return actual <= value;
    case "<":
      return actual < value;
    case "==":
      return actual === value;
    case "!=":
      return actual !== value;
    default:
      return false;
  }
}

/** True when the criteria define no actual success condition (open play). */
export function isEmptyCriteria(criteria: SuccessCriteria | null | undefined): boolean {
  return !criteria || !Array.isArray(criteria.conditions) || criteria.conditions.length === 0;
}

/**
 * Host-side success evaluation. A metric that the game has not reported is
 * treated as "not satisfied" (and listed in `missingMetrics`), so success is
 * only declared once every required signal is actually present.
 */
export function evaluateSuccess(
  criteria: SuccessCriteria | null | undefined,
  metrics: MetricsSummary,
): SuccessEvaluation {
  if (isEmptyCriteria(criteria)) {
    return { succeeded: false, conditions: [], missingMetrics: [] };
  }
  const c = criteria as SuccessCriteria;

  const conditions: ConditionResult[] = c.conditions.map((condition) => {
    const actual = metrics[condition.metric];
    const met =
      typeof actual === "number" && compare(actual, condition.op, condition.value);
    return { condition, actual, met };
  });

  const missingMetrics = (c.requiredMetrics ?? []).filter(
    (m) => typeof metrics[m] !== "number",
  );

  let succeeded: boolean;
  if (c.match === "any") {
    succeeded = conditions.some((r) => r.met);
  } else {
    succeeded = conditions.every((r) => r.met) && missingMetrics.length === 0;
  }

  return { succeeded, conditions, missingMetrics };
}

/**
 * Merge game-reported metrics with host-observed signals. The host is
 * authoritative for `hintsUsed` ("asking Dodi" — counted as Dodi turns while
 * the game is open): the merged value is the larger of the host count and any
 * in-game hint count the game reported, so neither source can hide assistance.
 */
export function mergeMetrics(
  gameMetrics: MetricsSummary | null | undefined,
  hostSignals: { dodiTurns?: number } = {},
): MetricsSummary {
  const merged: MetricsSummary = { ...(gameMetrics ?? {}) };
  if (typeof hostSignals.dodiTurns === "number") {
    const gameHints = typeof merged.hintsUsed === "number" ? merged.hintsUsed : 0;
    merged.hintsUsed = Math.max(gameHints, hostSignals.dodiTurns);
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Prompt template — documents the system for the game-generation model
// ---------------------------------------------------------------------------

export const SUCCESS_SYSTEM_TEMPLATE = `
## Dodi Progress & Success System (REQUIRED for goal-oriented games)

Every game declares a "progressKind":
- "goal": the game has a measurable objective (math, counting, reading, quizzes). It MUST report progress and metrics so the host can tell when the child succeeds.
- "open": open-ended/creative play (free drawing, sandbox, freeform story). No hard success; progress/metrics are optional.

Reserved state: include a "dodi" object inside the game state you send to the host:
  state.dodi = {
    progressKind: "goal" | "open",
    progress: <number 0..1>,           // completion toward the goal
    progressLabel: "<short label>",    // optional, e.g. "2 of 3 solved"
    metrics: { /* standardized keys below, all optional */ }
  }

Standardized metric vocabulary (report only what's relevant; numbers only):
- correct, incorrect, attempts, accuracy (0..1), streak, score
- hintsUsed (in-game hints; the host separately counts when the child asks Dodi)
- itemsCompleted, itemsTotal
- elapsedMs, maxTaskMs (slowest single task), avgTaskMs
Game-specific values go under metrics.custom = { ... } and are NOT used for success.

Emit a "game:progress" message (immediately, in addition to game:state) whenever progress or a
metric changes meaningfully (e.g. after each correct answer or completed task):
  parent.postMessage({ type: 'game:progress', token: bridgeToken,
    payload: { progress: <0..1>, progressLabel?: '...', metrics: { ... } } }, '*');

The host decides success from the parent's success definition. When it's met, the host sends a
'dodi:success' message ({ summary?, metrics? }) — react to it by showing your celebration/win UI.
The success goal is delivered in the 'dodi:init' payload under payload.goal
({ learningGoal, successDefinition, successCriteria, progressKind }); use it to show the goal and to
generate exactly enough tasks.

For a "goal" game you MUST: set progressKind to "goal", report every metric named in the success
criteria's requiredMetrics, send "game:progress", and update state.dodi.metrics.
`.trim();
