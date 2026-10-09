import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { resolveAuth, unauthorizedResponse } from "@/lib/resolve-auth";

export async function GET(request: Request): Promise<Response> {
  try {
    const { accountId, via, scopes } = await resolveAuth(request, { agentScope: "any" });
    return NextResponse.json({ accountId, via, scopes: scopes ? [...scopes] : null });
  } catch (error) {
    return (
      unauthorizedResponse(error) ??
      serverErrorResponse(error, "Internal error", "api/whoami#GET", {
        expose: false,
      })
    );
  }
}
