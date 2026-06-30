import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { listSystemLogs } from "@/services/system-logs";

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
    const logs = await listSystemLogs(supabase, accountId, {
      kidId,
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
