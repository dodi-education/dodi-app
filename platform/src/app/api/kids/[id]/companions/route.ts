import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { CompanionFieldsSchema, companionErrorResponse } from "@/lib/companion-api";
import { CompanionError, createCompanion } from "@/services/companions";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Adds a companion to a kid. Companions are read through the kid (embedded). */
export async function POST(
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
    const companion = await createCompanion(db, accountId, id, result.data);
    return NextResponse.json(companion, { status: 201 });
  } catch (error) {
    if (error instanceof CompanionError) return companionErrorResponse(error);
    return serverErrorResponse(
      error,
      "Failed to create companion",
      "api/kids/[id]/companions#POST",
      { accountId },
    );
  }
}
