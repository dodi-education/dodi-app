import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import {
  getAgentSession,
  deactivateAgentSession,
} from "@/lib/services/agent-sessions";
import { abortSession } from "@/lib/ai/agent-session";

const log = createLogger("agent-deactivate");

/** POST /api/agent/sessions/:id/deactivate — abort a running agent task. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const session = await getAgentSession(supabase, id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.account_id !== user.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (session.status !== "active") {
      log.warn("already_terminal", { sessionId: id, status: session.status });
      return NextResponse.json(
        { error: "Session is not active", status: session.status },
        { status: 409 },
      );
    }

    log.info("deactivation_requested", { sessionId: id, profileId: session.profile_id });

    // Abort the in-memory agent task (if still running on this server)
    abortSession(session.profile_id);

    // Update DB status
    await deactivateAgentSession(supabase, id);

    log.info("deactivated", { sessionId: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to deactivate session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
