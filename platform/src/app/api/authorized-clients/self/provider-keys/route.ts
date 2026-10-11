import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { getAgentProviderKeys } from "@/services/authorized-clients";

/**
 * Agent (`studio`): its build provider keys, sealed by the parent's browser to
 * this agent's KEM key when they allowed it. Only the agent can open them.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, { agentScope: "studio" });
  if (auth instanceof Response) return auth;
  if (auth.via !== "agent" || !auth.deviceId) {
    return NextResponse.json(
      { error: "Only an agent has provider keys" },
      { status: 400 },
    );
  }
  const keys = await getAgentProviderKeys(
    auth.db,
    auth.accountId,
    auth.deviceId,
  );
  if (!keys)
    return NextResponse.json({ error: "no_provider_keys" }, { status: 404 });
  return NextResponse.json(keys);
}
