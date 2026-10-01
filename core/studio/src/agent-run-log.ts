/**
 * The game agent's run log: what one Game Studio build did, in order, so the
 * parent can see how the agent got to its result (its narration, the steps it
 * took, and every screenshot check with the frames it looked at).
 *
 * Built client-side from the loop's existing callbacks (onStep, onActivity,
 * onViewGame) through a pure reducer, attached to the build's assistant reply
 * and sealed with the transcript (E2EE). Display only: it is NEVER fed back to
 * the model as a prior turn.
 */

import type { AgentStep } from "@dodi/types/agent-progress";

export interface AgentRunFrame {
  label: string;
  /** Bounded thumbnail (data URL). This is what the sealed transcript keeps. */
  image: string;
  /** Full-size capture for the large view. Session only, never sealed. */
  fullImage?: string;
}

export interface AgentRunNarration {
  kind: "narration";
  /** Milliseconds since the run started. */
  atMs: number;
  text: string;
}

export interface AgentRunStepEntry {
  kind: "step";
  atMs: number;
  step: AgentStep;
}

export interface AgentRunCheck {
  kind: "check";
  atMs: number;
  /** The step labels the render was asked for (frame 0 is the opening screen). */
  requestedSteps: string[];
  /** The service returned nothing (unreachable, timed out, malformed reply). */
  hasFailed: boolean;
  /** The game sent game:ready before the renderer's timeout. */
  isReady: boolean;
  frames: AgentRunFrame[];
  errors: string[];
  warnings: string[];
  layoutIssues: string[];
  /** Frames were captured but are no longer kept (older run in the transcript). */
  hasDroppedFrames?: boolean;
}

export type AgentRunEntry =
  AgentRunNarration | AgentRunStepEntry | AgentRunCheck;

const RUN_OUTCOMES = [
  "completed",
  "validation_failed",
  "stopped",
  "failed",
] as const;

export type AgentRunOutcome = (typeof RUN_OUTCOMES)[number];

function isOutcome(value: unknown): value is AgentRunOutcome {
  return RUN_OUTCOMES.includes(value as AgentRunOutcome);
}

export interface AgentRunLog {
  /** Epoch ms. */
  startedAt: number;
  /** Set when the run finished. */
  durationMs?: number;
  outcome?: AgentRunOutcome;
  entries: AgentRunEntry[];
}

/** A screenshot render as the log records it (frames already bounded). */
export interface AgentRunCheckInput {
  requestedSteps: string[];
  output: {
    frames: AgentRunFrame[];
    ready: boolean;
    warnings: string[];
    errors: string[];
    layoutIssues?: string[];
  } | null;
}

export type AgentRunEvent =
  | { type: "narration_start" }
  | { type: "narration_delta"; text: string }
  | { type: "step"; step: AgentStep }
  | { type: "check"; check: AgentRunCheckInput }
  | { type: "finish"; outcome: AgentRunOutcome };

export function startAgentRun(now: number): AgentRunLog {
  return { startedAt: now, entries: [] };
}

/** Drop a trailing narration block that never got any text. */
function pruneEmptyTail(entries: AgentRunEntry[]): AgentRunEntry[] {
  const last = entries[entries.length - 1];
  return last?.kind === "narration" && !last.text.trim()
    ? entries.slice(0, -1)
    : entries;
}

/** Trim narration blocks and drop empty ones (the settled form). */
function settleNarration(entries: AgentRunEntry[]): AgentRunEntry[] {
  const settled: AgentRunEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== "narration") settled.push(entry);
    else if (entry.text.trim())
      settled.push({ ...entry, text: entry.text.trim() });
  }
  return settled;
}

export function reduceAgentRun(
  log: AgentRunLog,
  event: AgentRunEvent,
  now: number,
): AgentRunLog {
  // A finished run is frozen: late callbacks (an abort racing a render) are ignored.
  if (log.outcome) return log;
  const atMs = Math.max(0, now - log.startedAt);
  const entries = log.entries;
  switch (event.type) {
    case "narration_start":
      return {
        ...log,
        entries: [
          ...pruneEmptyTail(entries),
          { kind: "narration", atMs, text: "" },
        ],
      };
    case "narration_delta": {
      if (!event.text) return log;
      const last = entries[entries.length - 1];
      if (last?.kind === "narration") {
        return {
          ...log,
          entries: [
            ...entries.slice(0, -1),
            { ...last, text: last.text + event.text },
          ],
        };
      }
      return {
        ...log,
        entries: [...entries, { kind: "narration", atMs, text: event.text }],
      };
    }
    case "step": {
      const base = pruneEmptyTail(entries);
      const last = base[base.length - 1];
      if (last?.kind === "step" && last.step === event.step) {
        return base === entries ? log : { ...log, entries: base };
      }
      return {
        ...log,
        entries: [...base, { kind: "step", atMs, step: event.step }],
      };
    }
    case "check": {
      const { requestedSteps, output } = event.check;
      const check: AgentRunCheck = {
        kind: "check",
        atMs,
        requestedSteps: [...requestedSteps],
        hasFailed: output === null,
        isReady: output?.ready ?? false,
        frames: output?.frames ?? [],
        errors: output?.errors ?? [],
        warnings: output?.warnings ?? [],
        layoutIssues: output?.layoutIssues ?? [],
      };
      return { ...log, entries: [...pruneEmptyTail(entries), check] };
    }
    case "finish":
      return {
        ...log,
        outcome: event.outcome,
        durationMs: atMs,
        entries: settleNarration(entries),
      };
  }
}

/** Screenshot checks in a run, in order. */
export function runChecks(log: AgentRunLog): AgentRunCheck[] {
  return log.entries.filter((e): e is AgentRunCheck => e.kind === "check");
}

/** The sealable form: no session-only full-size captures. */
function withoutFullImages(log: AgentRunLog): AgentRunLog {
  return {
    ...log,
    entries: log.entries.map((e) =>
      e.kind === "check"
        ? {
            ...e,
            frames: e.frames.map((f) => ({ label: f.label, image: f.image })),
          }
        : e,
    ),
  };
}

/** Keep the text of every check, drop its frames (marking that they existed). */
function withoutFrames(log: AgentRunLog): AgentRunLog {
  return {
    ...log,
    entries: log.entries.map((e) =>
      e.kind === "check" && e.frames.length > 0
        ? { ...e, frames: [], hasDroppedFrames: true }
        : e,
    ),
  };
}

/** Keep at most `max` frames in a run, newest checks first. */
function capFrames(log: AgentRunLog, max: number): AgentRunLog {
  let budget = max;
  const entries = [...log.entries];
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.kind !== "check" || e.frames.length === 0) continue;
    if (budget >= e.frames.length) {
      budget -= e.frames.length;
    } else {
      entries[i] = {
        ...e,
        frames: e.frames.slice(0, budget),
        hasDroppedFrames: true,
      };
      budget = 0;
    }
  }
  return { ...log, entries };
}

export interface RunBounds {
  /** Only the trailing this-many runs keep their frames. */
  runsWithFrames: number;
  /** Frame cap per kept run. */
  framesPerRun: number;
}

export const SEALED_RUN_BOUNDS: RunBounds = {
  runsWithFrames: 2,
  framesPerRun: 12,
};

/**
 * Bound the runs across a transcript for sealing: full-size captures never
 * leave the session, only the trailing runs keep thumbnails, capped per run.
 * Messages without a run are returned untouched.
 */
export function boundRunLogs<T extends { run?: AgentRunLog }>(
  messages: T[],
  bounds: RunBounds = SEALED_RUN_BOUNDS,
): T[] {
  let runsSeen = 0;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    const run = out[i].run;
    if (!run) continue;
    runsSeen += 1;
    const lean = withoutFullImages(run);
    out[i] = {
      ...out[i],
      run:
        runsSeen <= bounds.runsWithFrames
          ? capFrames(lean, bounds.framesPerRun)
          : withoutFrames(lean),
    };
  }
  return out;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function isEntry(value: unknown): value is AgentRunEntry {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;
  if (typeof e.atMs !== "number") return false;
  if (e.kind === "narration") return typeof e.text === "string";
  if (e.kind === "step") return typeof e.step === "string";
  if (e.kind !== "check") return false;
  return (
    isStringArray(e.requestedSteps) &&
    Array.isArray(e.frames) &&
    e.frames.every(
      (f: unknown) =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as Record<string, unknown>).label === "string" &&
        typeof (f as Record<string, unknown>).image === "string",
    ) &&
    isStringArray(e.errors) &&
    isStringArray(e.warnings) &&
    isStringArray(e.layoutIssues)
  );
}

/**
 * Restore a run log from an unsealed transcript. Anything malformed yields
 * `undefined` (the reply still shows, just without its run history); bad
 * entries are skipped rather than failing the whole log.
 */
export function restoreRunLog(value: unknown): AgentRunLog | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.startedAt !== "number" || !Array.isArray(raw.entries)) {
    return undefined;
  }
  return {
    startedAt: raw.startedAt,
    ...(typeof raw.durationMs === "number"
      ? { durationMs: raw.durationMs }
      : {}),
    ...(isOutcome(raw.outcome) ? { outcome: raw.outcome } : {}),
    entries: raw.entries.filter(isEntry),
  };
}

/** "0:07", "1:12", "12:05": offsets and durations on the timeline. */
export function formatRunClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
