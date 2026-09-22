import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceDb } from "@/lib/db";
import { OpsGamesQuerySchema, listOpsGames } from "@/services/ops-lists";

/**
 * One page of PLAINTEXT games for the ops console: system games and
 * publication copies. Private games stay E2EE and never appear here. Ops m2m
 * only — /api/internal auth, see lib/internal-auth.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = OpsGamesQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const games = await listOpsGames(serviceDb, parsed.data);
    return NextResponse.json(games);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list games",
      "api/internal/games#GET",
      {},
    );
  }
}
