/**
 * Fire-and-forget kid activity reporting (the parent's Insights feed). Never
 * throws; never includes transcript/memory content or E2EE plaintext.
 */
import type { PlatformApi } from "./platform";

export type KidActivityEvent =
  | "session_start"
  | "game_started"
  | "game_command_executed"
  | "game_command_failed"
  | "snapshot_created"
  | "snapshot_shared"
  | "friend_request_sent"
  | "friend_request_accepted";

export interface KidActivityInput {
  kidId: string;
  event: KidActivityEvent;
  message: string;
  personaId?: string | null;
}

export function logKidActivity(api: PlatformApi, input: KidActivityInput): void {
  void api
    .request("/api/activities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kidId: input.kidId,
        event: input.event,
        message: input.message,
        personaId: input.personaId ?? null,
      }),
    })
    .catch(() => {
      // non-critical
    });
}
