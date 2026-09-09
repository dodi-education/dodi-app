import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceDb } from "@/lib/db";
import { listPendingApprovals } from "@/services/friends";

/** Friendships across the parent's kids that await this parent's final approval. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const approvals = await listPendingApprovals(serviceDb, auth.accountId);
    return NextResponse.json(approvals);
  } catch (error) {
    return serverErrorResponse(error, "Failed to fetch approvals", "api/friends/approvals#GET", {
      accountId: auth.accountId,
    });
  }
}
