/**
 * Pure game-spec helpers shared by the browser UI and the server-side generation
 * agents: success-criteria coercion, the canonical empty criteria, the bridge
 * interface contract injected into generation prompts, and the mapped-success
 * shape. The server-only generation (Gemini single-shot) lives in the platform.
 */
import {
  SuccessCriteriaSchema,
  type ProgressKind,
  type SuccessCriteria,
} from "./success";

export const EMPTY_SUCCESS_CRITERIA: SuccessCriteria = {
  description: "",
  match: "all",
  conditions: [],
  requiredMetrics: [],
};

/** Coerce arbitrary model output into a valid SuccessCriteria (empty on failure). */
export function coerceSuccessCriteria(raw: unknown): SuccessCriteria {
  const parsed = SuccessCriteriaSchema.safeParse(raw);
  return parsed.success ? (parsed.data as SuccessCriteria) : EMPTY_SUCCESS_CRITERIA;
}

/** Coerce arbitrary model output into a valid ProgressKind (defaults to "open"). */
export function coerceProgressKind(raw: unknown): ProgressKind {
  return raw === "goal" ? "goal" : "open";
}

export const BRIDGE_INTERFACE_TEMPLATE = `
## Dodi Game Bridge Interface (REQUIRED)

The game MUST implement this postMessage bridge pattern:

1. Listen for 'message' events on window
2. On receiving 'dodi:init' message:
   - Store the bridge token from message.token
   - Send 'game:ready' to parent with { capabilities: string[], state: object }
3. On receiving 'dodi:command' message:
   - Execute the command from message.payload.command (has .type and .payload)
   - Send 'game:result' to parent with { command, result: { ok: boolean, error?: string }, state }
4. On receiving 'dodi:get_state' message:
   - Send 'game:state' to parent with the full current state object
5. Proactively send 'game:state' to parent:
   - After any user interaction that changes state (click, tap, drag end, key press)
   - After score, level, or progress changes
   - After timed events that change state (animation complete, countdown tick, round end)
   - Always send AFTER the change is applied, with the COMPLETE state object

Sending messages to parent:
  parent.postMessage({ type: 'game:ready|game:result|game:state|game:event|game:error', token: bridgeToken, payload: {...} }, '*');

The capabilities array in game:ready MUST list ALL command types the game supports.
The state object MUST include ALL meaningful game state (score, level, positions, selections, etc).
`.trim();

export interface MappedSuccess {
  progressKind: ProgressKind;
  successCriteria: SuccessCriteria;
}
