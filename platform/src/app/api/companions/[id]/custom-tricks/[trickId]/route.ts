import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { CustomTrickError, deleteCustomTrick } from "@/services/custom-tricks";

interface RouteContext {
  params: Promise<{ id: string; trickId: string }>;
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id, trickId } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;

  try {
    await deleteCustomTrick(db, accountId, id, trickId);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CustomTrickError) {
      return NextResponse.json({ error: error.code }, { status: 404 });
    }
    return serverErrorResponse(
      error,
      "Failed to delete trick",
      "api/companions/[id]/custom-tricks/[trickId]#DELETE",
      { accountId, expose: false },
    );
  }
}
