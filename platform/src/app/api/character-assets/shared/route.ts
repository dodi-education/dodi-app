import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { listSharedAssets } from "@/services/character-asset-publications";

/**
 * The published avatars and accessories this family added from Discover
 * (plaintext; files load from /api/discover/character-assets/[id]/file).
 * The family's asset store lists them next to its own sealed assets.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request, { agentScope: "assets" });
  if (auth instanceof Response) return auth;
  try {
    return NextResponse.json(await listSharedAssets(serviceDb, auth.accountId));
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list added assets",
      "api/character-assets/shared#GET",
      {
        accountId: auth.accountId,
      },
    );
  }
}
