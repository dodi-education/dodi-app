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
