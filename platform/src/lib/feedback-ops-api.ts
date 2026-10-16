/**
 * Shared plumbing for the ops console's feedback routes
 * (/api/internal/feedback/[id]/{read,solve,reopen}).
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import type { FeedbackActionOutcome } from "@/services/feedback-messages";

const StaffActionSchema = z.object({
  /** The staff email; the console also sends it as `x-ops-actor`. */
  actor: z.string().trim().min(1).max(200),
});

/**
 * The staff member behind a console action: the body's `actor`, else the
 * `x-ops-actor` header. Null when neither holds a usable email.
 */
export async function staffActorFrom(request: Request): Promise<string | null> {
  const body = StaffActionSchema.safeParse(await request.json().catch(() => null));
  if (body.success) return body.data.actor;
  const header = StaffActionSchema.safeParse({ actor: request.headers.get("x-ops-actor") ?? "" });
  return header.success ? header.data.actor : null;
}

/** Answer a staff action: `{ ok: true }`, 404 when gone, 409 when it changed nothing. */
export function feedbackActionResponse(
  outcome: FeedbackActionOutcome,
  log: { scope: string; event: string; feedbackId: string; actor: string | null },
): NextResponse {
  if (outcome !== "ok") {
    return NextResponse.json(
      { error: outcome },
      { status: outcome === "not_found" ? 404 : 409 },
    );
  }
  console.log(
    JSON.stringify({ ts: new Date().toISOString(), level: "info", ...log }),
  );
  return NextResponse.json({ ok: true });
}
