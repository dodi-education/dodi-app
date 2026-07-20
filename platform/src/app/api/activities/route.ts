import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getKid } from "@/services/kids";
import { listActivities, logActivity } from "@/services/activities";

/** Kid activity kinds (no memory_* — those live in memories tables). */
const ACTIVITY_EVENTS = [
  "session_start",
  "game_started",
  "game_command_executed",
  "game_command_failed",
  "snapshot_created",
  "snapshot_shared",
  "friend_request_sent",
  "friend_request_accepted",
] as const;

const CreateActivitySchema = z.object({
  kidId: z.string().uuid(),
  event: z.enum(ACTIVITY_EVENTS),
  message: z.string().min(1).max(800),
  personaId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const kidId = searchParams.get("kidId") ?? undefined;
  const personaId = searchParams.get("personaId") ?? undefined;
  const event = searchParams.get("event") ?? undefined;
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

  try {
    const rows = await listActivities(supabase, accountId, {
      kidId,
      personaId,
      event,
      limit,
      offset,
    });

    return NextResponse.json(rows);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch activities",
      "api/activities#GET",
      { accountId },
    );
  }
}

/** POST a kid activity (session, snapshot, friends, …). Fire-and-forget from clients. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = CreateActivitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const kid = await getKid(supabase, parsed.data.kidId);
    if (!kid || kid.account_id !== accountId) {
      return NextResponse.json({ error: "Kid not found" }, { status: 404 });
    }

    await logActivity(supabase, {
      kid_id: kid.id,
      account_id: accountId,
      persona_id:
        parsed.data.personaId ?? kid.active_persona?.id ?? null,
      event: parsed.data.event,
      message: parsed.data.message,
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to log activity",
      "api/activities#POST",
      { accountId },
    );
  }
}
