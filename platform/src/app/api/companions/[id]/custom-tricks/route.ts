import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  CustomTrickError,
  createCustomTrick,
  listCustomTricks,
} from "@/services/custom-tricks";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// trick_enc is an opaque client-sealed enc:v1 record; the server never reads it.
const CreateCustomTrickSchema = z.object({
  trick_enc: z.string().min(1).max(64000),
});

function errorResponse(error: CustomTrickError): NextResponse {
  return NextResponse.json(
    { error: error.code },
    { status: error.code === "not_found" ? 404 : 409 },
  );
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;

  try {
    return NextResponse.json(await listCustomTricks(db, accountId, id));
  } catch (error) {
    if (error instanceof CustomTrickError) return errorResponse(error);
    return serverErrorResponse(error, "Failed to fetch tricks", "api/companions/[id]/custom-tricks#GET", {
      accountId,
      expose: false,
    });
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;

  const result = CreateCustomTrickSchema.safeParse(await request.json());
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const trick = await createCustomTrick(db, accountId, id, result.data.trick_enc);
    return NextResponse.json(trick, { status: 201 });
  } catch (error) {
    if (error instanceof CustomTrickError) return errorResponse(error);
    return serverErrorResponse(error, "Failed to save trick", "api/companions/[id]/custom-tricks#POST", {
      accountId,
    });
  }
}
