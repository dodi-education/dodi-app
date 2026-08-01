/**
 * Agent progress event types for SSE streaming.
 *
 * Used by the agent API to emit real-time progress events
 * and by the client to update visual indicators + voice narration.
 */

import type { AgentCodeResult } from "./tasks";

export type AgentStep =
  | "reading_docs"
  | "generating_image"
  | "generating_preview"
  | "writing_code"
  | "validating"
  | "fixing_validation"
  | "finalizing";

/**
 * Fine-grained live activity streamed WHILE a model turn runs (vs. AgentStep,
 * which only changes when a tool executes). Drives the studio's narration line
 * and write-progress ticker. Ephemeral display state — never persisted; the
 * sealed transcript stays the only durable record.
 */
export type AgentActivityEvent =
  /** A new assistant text block begins — reset the narration line. */
  | { type: "narration_start" }
  /** A chunk of assistant text (the model narrating what it does next). */
  | { type: "narration_delta"; text: string }
  /** The model started emitting a tool call (fires before the input finishes streaming). */
  | { type: "tool_started"; name: string }
  /** Cumulative streamed input size of the current write_game_code call. */
  | { type: "write_progress"; chars: number };

export type AgentProgressEvent =
  | { type: "session_started"; sessionId: string }
  | { type: "step"; step: AgentStep; turn: number }
  | { type: "validation"; valid: boolean; errors: string[]; turn: number }
  | { type: "complete"; result: AgentCodeResult }
  | { type: "error"; message: string };

export interface CreatingGameProgress {
  step: AgentStep;
  turn: number;
  startedAt: number; // Date.now() for elapsed display
}
