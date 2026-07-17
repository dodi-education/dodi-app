import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getDashboardStats } from "@/services/dashboard";

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const stats = await getDashboardStats(supabase, accountId);
    return NextResponse.json(stats);
  } catch (error) {
    return serverErrorResponse(error, "Failed to fetch dashboard stats", "api/dashboard#GET", {
      accountId,
    });
  }
}
