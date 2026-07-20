/**
 * Fire-and-forget kid activity reporting (Insights feed). Never throws;
 * never includes transcript/memory content.
 */

import { dodi } from "@/lib/api";

export type KidActivityEvent =
  | "session_start"
  | "game_started"
  | "game_command_executed"
  | "game_command_failed"
  | "snapshot_created"
  | "snapshot_shared"
  | "friend_request_sent"
  | "friend_request_accepted";

export function logKidActivity(input: {
  kidId: string;
  event: KidActivityEvent;
  message: string;
  personaId?: string | null;
}): void {
  void dodi
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
