import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { revokeOwnAgent } from "@/services/authorized-clients";

/** Agent: what this connection is and was granted (`dodi whoami`). */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, { agentScope: "any" });
  if (auth instanceof Response) return auth;
  if (auth.via !== "agent" || !auth.deviceId) {
    return NextResponse.json(
      { error: "Only an agent connection has a self" },
      { status: 400 },
    );
  }
  const client = await auth.db
    .selectFrom("authorized_clients")
    .select(["id", "name", "scopes", "expires_at", "enrolled_at"])
    .where("device_id", "=", auth.deviceId)
    .where("account_id", "=", auth.accountId)
    .executeTakeFirst();
  return NextResponse.json({ client: client ?? null });
}

/**
 * Agent: disconnect itself (`dodi logout`). The same one-step revoke a parent
 * does: the vault wrap goes first, so the keys left on the agent's machine
 * stop working.
 */
export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireAuth(request, { agentScope: "any" });
  if (auth instanceof Response) return auth;
  if (auth.via !== "agent" || !auth.deviceId) {
    return NextResponse.json(
      { error: "Only an agent connection can disconnect itself" },
      { status: 400 },
    );
  }
  try {
    await revokeOwnAgent(auth.db, serviceDb, auth.accountId, auth.deviceId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return serverErrorResponse(
      e,
      "Failed to disconnect",
      "api/authorized-clients/self#DELETE",
      {
        accountId: auth.accountId,
      },
    );
  }
}
