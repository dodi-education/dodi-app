import { NextResponse } from "next/server";
import { z } from "zod/v4";

import {
  UpdateCharacterAssetSchema,
  characterAssetErrorResponse,
  readJsonBody,
} from "@/lib/character-asset-api";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  CharacterAssetError,
  deleteCharacterAsset,
  getCharacterAsset,
  updateCharacterAsset,
} from "@/services/character-assets";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const IdSchema = z.string().uuid();

function notFound(): NextResponse {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

/** One asset with its sealed file (glb_enc). */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request, { agentScope: "assets" });
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;
  if (!IdSchema.safeParse(id).success) return notFound();

  try {
    return NextResponse.json(await getCharacterAsset(db, accountId, id));
  } catch (error) {
    if (error instanceof CharacterAssetError)
      return characterAssetErrorResponse(error);
    return serverErrorResponse(
      error,
      "Failed to fetch character asset",
      "api/character-assets/[id]#GET",
      {
        accountId,
        expose: false,
      },
    );
  }
}

/** Replaces sealed fields (a new file comes with its byte_size). */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request, { agentScope: "assets" });
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;
  if (!IdSchema.safeParse(id).success) return notFound();

  const result = UpdateCharacterAssetSchema.safeParse(
    await readJsonBody(request),
  );
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      await updateCharacterAsset(db, accountId, id, result.data),
    );
  } catch (error) {
    if (error instanceof CharacterAssetError)
      return characterAssetErrorResponse(error);
    return serverErrorResponse(
      error,
      "Failed to update character asset",
      "api/character-assets/[id]#PATCH",
      {
        accountId,
      },
    );
  }
}

/**
 * Deletes an asset (parents only: agents can't delete). Companions wearing it
 * keep their sealed look; clients drop the unknown ref and fall back.
 */
export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;
  if (!IdSchema.safeParse(id).success) return notFound();

  try {
    await deleteCharacterAsset(db, accountId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof CharacterAssetError)
      return characterAssetErrorResponse(error);
    return serverErrorResponse(
      error,
      "Failed to delete character asset",
      "api/character-assets/[id]#DELETE",
      {
        accountId,
        expose: false,
      },
    );
  }
}
