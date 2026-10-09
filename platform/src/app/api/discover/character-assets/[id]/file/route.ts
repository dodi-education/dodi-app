import { NextResponse } from "next/server";

import { UUID } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { requireAuth } from "@/lib/resolve-auth";
import { getPublishedAssetFile } from "@/services/character-asset-publications";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** A live asset's .glb (base64) for the renderer. Public content, any signed-in family. */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (!UUID.safeParse(id).success)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const file = await getPublishedAssetFile(serviceDb, id);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(file, {
    headers: { "cache-control": "private, max-age=3600" },
  });
}
