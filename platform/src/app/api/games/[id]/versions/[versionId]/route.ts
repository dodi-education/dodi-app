import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getGameVersion } from "@/services/games";

interface RouteContext {
  params: Promise<{ id: string; versionId: string }>;
}

/** A single version row including its full code_bundle (diff / restore preview). */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id, versionId } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const version = await getGameVersion(supabase, id, versionId);
    if (!version) {
      return NextResponse.json({ error: "Version not found" }, { status: 404 });
    }
    return NextResponse.json(version);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch game version",
      "api/games/[id]/versions/[versionId]#GET",
      { accountId },
    );
  }
}
