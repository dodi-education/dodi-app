import { NextResponse } from "next/server";

import { UUID } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  AssetPublicationError,
  addSharedAsset,
  removeSharedAsset,
} from "@/services/character-asset-publications";

/**
 * Add a live avatar or accessory to this family (PUT) or remove it (DELETE).
 * Nothing is copied: a sharing row points at the single published row. The
 * row is written through the caller's RLS handle; the live check uses the
 * service handle (other accounts' rows are RLS-hidden).
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!UUID.safeParse(id).success)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    await addSharedAsset(auth.db, serviceDb, auth.accountId, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AssetPublicationError)
      return NextResponse.json({ error: error.code }, { status: 404 });
    return serverErrorResponse(
      error,
      "Failed to add",
      "api/discover/character-assets/[id]/sharing#PUT",
      {
        accountId: auth.accountId,
      },
    );
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!UUID.safeParse(id).success)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  await removeSharedAsset(auth.db, auth.accountId, id);
  return NextResponse.json({ ok: true });
}
