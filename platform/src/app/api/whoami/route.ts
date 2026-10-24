import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { resolveAuth, unauthorizedResponse } from "@/lib/resolve-auth";

/**
 * Who is calling: the family the request acts as (`accountId`), how it
 * authenticated, an agent's scopes, and for a person the login and its role in
 * the family. ai.dodi.app introspects parent bearers here.
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const { accountId, via, scopes, userId, role } = await resolveAuth(request, {
      agentScope: "any",
    });
    return NextResponse.json({
      accountId,
      via,
      scopes: scopes ? [...scopes] : null,
      userId: userId ?? null,
      role: role ?? null,
    });
  } catch (error) {
    return (
      unauthorizedResponse(error) ??
      serverErrorResponse(error, "Internal error", "api/whoami#GET", {
        expose: false,
      })
    );
  }
}
