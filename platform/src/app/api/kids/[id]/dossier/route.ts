import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getKidMemoryDossier } from "@/services/kids";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * The kid's sealed memory dossier, for a connected agent granted
 * `kids:memory` (parents read it with the kid row). The agent decrypts it, and
 * its AI provider reads it: the approval screen says so.
 */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id: kidId } = await context.params;
  const auth = await requireAuth(request, { agentScope: "kids:memory" });
  if (auth instanceof Response) return auth;
  try {
    const dossier = await getKidMemoryDossier(auth.db, auth.accountId, kidId);
    if (!dossier)
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ memory: dossier.memory });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to load memory",
      "api/kids/[id]/dossier#GET",
      {
        accountId: auth.accountId,
        expose: false,
      },
    );
  }
}
