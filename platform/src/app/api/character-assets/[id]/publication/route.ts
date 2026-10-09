import { NextResponse } from "next/server";

import {
  SubmitAssetPublicationSchema,
  UUID,
  assetPublicationErrorResponse,
  validationFailed,
} from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  AssetPublicationError,
  getAssetPublicationStatus,
  submitAssetPublication,
  withdrawAssetPublication,
} from "@/services/character-asset-publications";

/**
 * Discover publication of a family's avatar or accessory. The client decrypts
 * its sealed asset and posts a plaintext copy; the private asset stays sealed.
 * Writes go through the service handle (RLS forbids users writing publication
 * rows), scoped to the caller's account in the service.
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** The submission's review state, or null when never submitted. */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request, { agentScope: "assets:publish" });
  if (auth instanceof Response) return auth;
  if (!UUID.safeParse(id).success)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    return NextResponse.json({
      publication: await getAssetPublicationStatus(
        serviceDb,
        auth.accountId,
        id,
      ),
    });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to load publication",
      "api/character-assets/[id]/publication#GET",
      {
        accountId: auth.accountId,
      },
    );
  }
}

/** Submit or resubmit: the server re-validates the file, then a person reviews it. */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request, { agentScope: "assets:publish" });
  if (auth instanceof Response) return auth;
  if (!UUID.safeParse(id).success)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = SubmitAssetPublicationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return validationFailed(parsed.error.issues);
  try {
    const publication = await submitAssetPublication(serviceDb, {
      accountId: auth.accountId,
      sourceAssetId: id,
      name: parsed.data.name,
      description: parsed.data.description,
      glbBase64: parsed.data.glbBase64,
      previewImage: parsed.data.previewImage,
    });
    return NextResponse.json({ publication }, { status: 201 });
  } catch (error) {
    if (error instanceof AssetPublicationError)
      return assetPublicationErrorResponse(error);
    return serverErrorResponse(
      error,
      "Failed to submit",
      "api/character-assets/[id]/publication#POST",
      {
        accountId: auth.accountId,
      },
    );
  }
}

/** Withdraw (parents only): the copy leaves Discover and families that added it lose it. */
export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!UUID.safeParse(id).success)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const isWithdrawn = await withdrawAssetPublication(
    serviceDb,
    auth.accountId,
    id,
  );
  return isWithdrawn
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "not_found" }, { status: 404 });
}
