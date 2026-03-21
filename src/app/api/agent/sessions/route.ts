import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listAgentSessions } from "@/lib/services/agent-sessions";

/** GET /api/agent/sessions — list agent sessions for the authenticated account. */
export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

  try {
    const sessions = await listAgentSessions(supabase, user.id, {
      profileId,
      status,
      limit,
      offset,
    });

    return NextResponse.json(sessions);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch agent sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
