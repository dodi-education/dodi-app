import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
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
    return serverErrorResponse(
      error,
      "Failed to fetch logs",
      "api/system-logs#GET",
      { accountId },
    );
  }
}
