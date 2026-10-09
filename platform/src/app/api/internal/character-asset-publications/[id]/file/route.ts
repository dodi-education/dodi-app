import { NextResponse } from "next/server";

import { UUID } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { getAssetPublicationFile } from "@/services/character-asset-publications";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** A submitted .glb (base64), any state, for the reviewer. Ops m2m only. */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID.safeParse(id).success)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const file = await getAssetPublicationFile(serviceDb, id);
  return file
    ? NextResponse.json(file)
    : NextResponse.json({ error: "not_found" }, { status: 404 });
}
