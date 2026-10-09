import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { listPublishedAssets } from "@/services/character-asset-publications";

/**
 * Live avatars and accessories on Discover (?kind=avatar|accessory), newest
 * first, each with whether this family added it. Cross-account read through
 * the service handle with an explicit projection: the byline is the
 * publication handle, never an account id.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const kind = new URL(request.url).searchParams.get("kind");
  try {
    const assets = await listPublishedAssets(serviceDb, auth.accountId, {
      ...(kind === "avatar" || kind === "accessory" ? { kind } : {}),
    });
    return NextResponse.json(assets);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list assets",
      "api/discover/character-assets#GET",
      {
        accountId: auth.accountId,
      },
    );
  }
}
