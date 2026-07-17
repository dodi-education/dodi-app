import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createLogger } from "@/logger";
import { requireAuth } from "@/lib/resolve-auth";
import { isErrorLogTypeEnabled, recordErrorLog } from "@/services/error-logs";

const log = createLogger("error-logs");

// Operational diagnostics only (counts, flags, enum-ish strings) — mirrors
// ErrorLogMeta. A strict shape (not a passthrough record) so the client can
// never smuggle content into telemetry.
const ErrorLogMetaSchema = z
  .object({
    lastStep: z.string().max(40),
    durationMs: z.number().nonnegative(),
    online: z.boolean(),
    visibility: z.string().max(20),
    turns: z.number().nonnegative(),
    stopReason: z.string().max(40),
    sawToolCalls: z.boolean(),
    sawText: z.boolean(),
  })
  .partial();

const ErrorLogReportSchema = z.object({
  context: z.enum(["game_build", "game_update", "game_save"]),
  kidId: z.string().uuid().nullable().optional(),
  gameId: z.string().uuid().nullable().optional(),
  provider: z.string().min(1).max(40).optional(),
  model: z.string().min(1).max(100).optional(),
  errorName: z.string().max(100).optional(),
  errorMessage: z.string().max(2000).optional(),
  httpStatus: z.number().int().min(100).max(599).nullable().optional(),
  meta: ErrorLogMetaSchema.optional(),
});

/**
 * User-authed: record one client-side failure report. `type` ("client"),
 * `account_id` (from auth) and `user_agent` (from the request) are stamped
 * here — the client sends none of them. The response carries no details
 * beyond the id; the UI keeps its generic message.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = ErrorLogReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const report = parsed.data;

  // Client-error logging switched off — accept and drop.
  if (!isErrorLogTypeEnabled("client")) {
    return new Response(null, { status: 204 });
  }

  try {
    const event = await recordErrorLog(supabase, {
      accountId,
      type: "client",
      ...report,
      userAgent: request.headers.get("user-agent"),
    });
    // Dev mirror (prod file logging is off; the table is the durable channel).
    log.error("client_error_reported", {
      id: event.id,
      context: report.context,
      provider: report.provider,
      model: report.model,
      errorName: report.errorName,
      httpStatus: report.httpStatus,
      ...report.meta,
    });
    return NextResponse.json({ id: event.id }, { status: 201 });
  } catch (error) {
    // Deliberately NOT serverErrorResponse: if persisting error logs fails,
    // logging that failure to the same table would fail the same way.
    const message = error instanceof Error ? error.message : "Failed to record error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
