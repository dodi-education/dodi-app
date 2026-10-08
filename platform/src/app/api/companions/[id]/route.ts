import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { CompanionFieldsSchema, companionErrorResponse } from "@/lib/companion-api";
import {
  CompanionError,
  deleteCompanion,
  updateCompanion,
} from "@/services/companions";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;

  const result = CompanionFieldsSchema.safeParse(await request.json());
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const companion = await updateCompanion(db, accountId, id, result.data);
    return NextResponse.json(companion);
  } catch (error) {
    if (error instanceof CompanionError) return companionErrorResponse(error);
    return serverErrorResponse(error, "Failed to update companion", "api/companions/[id]#PATCH", {
      accountId,
    });
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;

  try {
    await deleteCompanion(db, accountId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CompanionError) return companionErrorResponse(error);
    return serverErrorResponse(error, "Failed to delete companion", "api/companions/[id]#DELETE", {
      accountId,
      expose: false,
    });
  }
}
