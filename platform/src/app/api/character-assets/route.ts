import { NextResponse } from "next/server";

import {
  CreateCharacterAssetSchema,
  characterAssetErrorResponse,
  readJsonBody,
} from "@/lib/character-asset-api";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  CharacterAssetError,
  createCharacterAsset,
  listCharacterAssets,
} from "@/services/character-assets";

/** The family's own avatars and accessories, without their (large) sealed files. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request, { agentScope: "assets" });
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;

  try {
    return NextResponse.json(await listCharacterAssets(db, accountId));
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch character assets",
      "api/character-assets#GET",
      {
        accountId,
        expose: false,
      },
    );
  }
}

/** Stores a sealed asset (validated and sealed on the client); 201 without the file. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request, { agentScope: "assets" });
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;

  const result = CreateCharacterAssetSchema.safeParse(
    await readJsonBody(request),
  );
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const asset = await createCharacterAsset(db, accountId, result.data);
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    if (error instanceof CharacterAssetError)
      return characterAssetErrorResponse(error);
    return serverErrorResponse(
      error,
      "Failed to save character asset",
      "api/character-assets#POST",
      {
        accountId,
      },
    );
  }
}
