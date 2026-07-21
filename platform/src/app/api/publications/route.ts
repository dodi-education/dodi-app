import { NextResponse } from "next/server";

import { constantTimeEqual, utf8ToBytes } from "@dodi/crypto";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceClient } from "@/lib/supabase";
import { listPendingPublications } from "@/services/game-publications";

/**
 * The review queue: submissions awaiting approval, oldest first. Server-to-server
 * only, behind the same PUBLICATION_REVIEW_SECRET as the review stamp — this is
 * how the review pass discovers what to look at.
 */
function isAuthorized(request: Request): boolean {
  const expected = process.env.PUBLICATION_REVIEW_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-review-secret") ?? "";
  return constantTimeEqual(utf8ToBytes(provided), utf8ToBytes(expected));
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const publications = await listPendingPublications(serviceClient());
    return NextResponse.json({ publications });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list pending publications",
      "api/publications#GET",
      {},
    );
  }
}
