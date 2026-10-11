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
  const [client, account] = await Promise.all([
    auth.db
      .selectFrom("authorized_clients")
      .select([
        "id",
        "name",
        "scopes",
        "expires_at",
        "enrolled_at",
        "provider_keys_set_at",
      ])
      .where("device_id", "=", auth.deviceId)
      .where("account_id", "=", auth.accountId)
      .executeTakeFirst(),
    auth.db
      .selectFrom("accounts")
      .select("language")
      .where("id", "=", auth.accountId)
      .executeTakeFirst(),
  ]);
  // The parent's UI language: what the agent writes into the studio thread in.
  return NextResponse.json({
    client: client ?? null,
    language: account?.language ?? "en",
  });
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
