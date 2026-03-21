import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getActiveAgentSession } from "@/lib/services/agent-sessions";

/** GET /api/agent/sessions/active — get the most recent active session for a profile (recovery). */
export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId");
  const context = searchParams.get("context") ?? undefined;
  const gameId = searchParams.get("gameId") ?? undefined;

  if (!profileId) {
    return NextResponse.json(
      { error: "profileId is required" },
      { status: 400 },
    );
  }

  try {
    const session = await getActiveAgentSession(supabase, profileId, context, gameId);

    // Verify ownership (RLS should handle this but be explicit)
    if (session && session.account_id !== user.id) {
      return NextResponse.json(null);
    }

    return NextResponse.json(session);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to check active sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
