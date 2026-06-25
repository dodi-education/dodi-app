import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { listPendingApprovals } from "@/services/friends";

/** Friendships across the parent's kids that await this parent's final approval. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const approvals = await listPendingApprovals(serviceClient(), auth.accountId);
    return NextResponse.json(approvals);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch approvals";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
