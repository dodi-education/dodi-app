/** GET /api/account/members — the family's people (any member may see who is in it). */
import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { listMembers } from "@/services/account-members";

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, { memberScope: "any" });
  if (auth instanceof Response) return auth;
  if (auth.via !== "user") {
    return NextResponse.json({ error: "Only a person's login can do this" }, { status: 403 });
  }
  try {
    return NextResponse.json({
      members: await listMembers(serviceDb, auth.accountId, auth.userId ?? null),
    });
  } catch (error) {
    return serverErrorResponse(error, "Failed to load the family", "api/account/members#GET", {
      accountId: auth.accountId,
    });
  }
}
