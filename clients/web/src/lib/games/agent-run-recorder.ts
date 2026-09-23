/**
 * Glue between the game agent's callbacks and the pure run-log reducer
 * (agent-run-log.ts): one recorder per build, fed from onStep / onActivity and
 * a wrapped onViewGame, publishing every new log through `onChange` so the
 * studio can render the timeline live.
 */

import type { AgentActivityEvent, AgentStep } from "@dodi/types/agent-progress";
import type {
  RenderGameInput,
  RenderGameOutput,
} from "@dodi/ai/game-agent-tools";

import {
  type AgentRunEvent,
  type AgentRunFrame,
  type AgentRunLog,
  type AgentRunOutcome,
  reduceAgentRun,
  startAgentRun,
} from "@/lib/games/agent-run-log";

/** Thumbnail bound for frames kept in the run log (and its sealed copy). */
export const RUN_FRAME_BOUND = {
  maxWidth: 320,
  maxHeight: 400,
  quality: 0.7,
} as const;

type ViewGame = (input: RenderGameInput) => Promise<RenderGameOutput | null>;
type Thumbnail = (dataUrl: string) => Promise<string | null>;

export interface AgentRunRecorder {
  onStep: (step: AgentStep) => void;
  onActivity: (event: AgentActivityEvent) => void;
  /** Wrap the render callback so every screenshot check lands in the log. */
  wrapViewGame: (view: ViewGame) => ViewGame;
  /** Freeze the log with its outcome and return it. */
  finish: (outcome: AgentRunOutcome) => AgentRunLog;
}

export function createAgentRunRecorder(options: {
  onChange: (log: AgentRunLog) => void;
  thumbnail: Thumbnail;
  now?: () => number;
}): AgentRunRecorder {
  const now = options.now ?? Date.now;
  let log = startAgentRun(now());
  const dispatch = (event: AgentRunEvent): void => {
    const next = reduceAgentRun(log, event, now());
    if (next === log) return;
    log = next;
    options.onChange(log);
  };

  const recordFrames = async (
    output: RenderGameOutput,
  ): Promise<AgentRunFrame[]> => {
    const frames = await Promise.all(
      output.frames.map(async (frame): Promise<AgentRunFrame | null> => {
        const image = await options.thumbnail(frame.image).catch(() => null);
        return image
          ? { label: frame.label, image, fullImage: frame.image }
          : null;
      }),
    );
    return frames.filter((f): f is AgentRunFrame => f !== null);
  };

  return {
    onStep: (step) => dispatch({ type: "step", step }),
    onActivity: (event) => {
      if (event.type === "narration_start")
        dispatch({ type: "narration_start" });
      else if (event.type === "narration_delta")
        dispatch({ type: "narration_delta", text: event.text });
    },
    wrapViewGame: (view) => async (input) => {
      // A render that throws is logged as a failed check, then rethrown so
      // the loop handles it exactly as before.
      const output = await view(input).catch((error: unknown) => {
        dispatch({
          type: "check",
          check: { requestedSteps: input.steps.map((s) => s.label), output: null },
        });
        throw error;
      });
      const requestedSteps = input.steps.map((s) => s.label);
      // Recording must never break the loop: a thumbnail failure only costs
      // the log its frames, the model still gets the full output.
      try {
        dispatch({
          type: "check",
          check: {
            requestedSteps,
            output: output && {
              ready: output.ready,
              errors: output.errors,
              warnings: output.warnings,
              layoutIssues: output.layoutIssues,
              frames: await recordFrames(output),
            },
          },
        });
      } catch {
        /* the run log is display chrome */
      }
      return output;
    },
    finish: (outcome) => {
      dispatch({ type: "finish", outcome });
      return log;
    },
  };
}
