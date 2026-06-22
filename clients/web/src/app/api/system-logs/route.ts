import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { listSystemLogs } from "@dodi/platform/services/system-logs";

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
  const personaId = searchParams.get("personaId") ?? undefined;
  const event = searchParams.get("event") ?? undefined;
  const limit = Math.min(
    parseInt(searchParams.get("limit") ?? "50", 10) || 50,
    200,
  );
  const offset = parseInt(searchParams.get("offset") ?? "0", 10) || 0;

  try {
    const logs = await listSystemLogs(supabase, user.id, {
      profileId,
      personaId,
      event,
      limit,
      offset,
    });

    return NextResponse.json(logs);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch logs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
