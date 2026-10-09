import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { UUID } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { approveAssetPublication } from "@/services/character-asset-publications";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ApproveSchema = z.object({
  actor: z.string().trim().max(200).optional(),
});

/** Put a submitted avatar or accessory live on Discover. Ops m2m only. */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID.safeParse(id).success)
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = ApproveSchema.safeParse(await request.json().catch(() => ({})));
  const outcome = await approveAssetPublication(serviceDb, id);
  if (outcome !== "ok") {
    return NextResponse.json(
      { error: outcome },
      { status: outcome === "not_found" ? 404 : 409 },
    );
  }
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "info",
      scope: "api/internal/character-asset-publications/[id]/approve#POST",
      event: "asset_publication_approved",
      publicationId: id,
      actor: body.success ? (body.data.actor ?? null) : null,
    }),
  );
  return NextResponse.json({ ok: true });
}
