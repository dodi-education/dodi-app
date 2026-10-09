import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { listPendingAssetPublications } from "@/services/character-asset-publications";

/**
 * The avatar and accessory review queue, oldest first (files load from
 * ./[id]/file). Ops m2m only: /api/internal auth, see lib/internal-auth.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({
      publications: await listPendingAssetPublications(serviceDb),
    });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list",
      "api/internal/character-asset-publications#GET",
      {},
    );
  }
}
