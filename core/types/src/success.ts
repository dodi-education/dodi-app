/**
 * Type contracts for Dodi's standardized progress & success system.
 *
 * These are the shared type-level definitions. The runtime side (zod schemas,
 * the host-side evaluator, the metric vocabulary, and the prompt template) lives
 * in the web/platform `games/success` module, which imports and re-exports these.
 */

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

export type Comparator = ">=" | ">" | "<=" | "<" | "==" | "!=";

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
