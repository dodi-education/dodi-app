import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceClient } from "@/lib/supabase";
import { listPendingPublications } from "@/services/game-publications";

/**
 * The review queue: submissions awaiting a verdict, oldest first — including
 * attempt-exhausted items the worker no longer picks up, so the operator sees
 * what is stuck. Ops m2m only — /api/internal auth, see lib/internal-auth.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const publications = await listPendingPublications(serviceClient());
    return NextResponse.json({ publications });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list pending publications",
      "api/internal/publications#GET",
      {},
    );
  }
}
