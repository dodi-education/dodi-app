import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { revokeClient } from "@/services/authorized-clients";

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * Parent: revoke one entry of the Access list in one step (vault wrap,
 * status and login session together), or decline a pending request.
 * Revoking the client making the request signs it out (`wasCurrent`).
 */
export async function DELETE(
  request: Request,
  context: Ctx,
): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  try {
    const outcome = await revokeClient(auth.db, serviceDb, auth.accountId, id, {
      sessionId: auth.sessionId ?? null,
    });
    if (!outcome.revoked)
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, wasCurrent: outcome.wasCurrent });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to revoke",
      "api/authorized-clients/[id]#DELETE",
      {
        accountId: auth.accountId,
      },
    );
  }
}
