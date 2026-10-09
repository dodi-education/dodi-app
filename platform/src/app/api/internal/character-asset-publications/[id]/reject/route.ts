import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { UUID, validationFailed } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { rejectAssetPublication } from "@/services/character-asset-publications";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const RejectSchema = z.object({
  /** Shown to the submitting family: say what to change. */
  reason: z.string().trim().min(1).max(1000),
  actor: z.string().trim().max(200).optional(),
});

/** Reject a submission (a live one leaves Discover). Ops m2m only. */
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
  const parsed = RejectSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return validationFailed(parsed.error.issues);
  const outcome = await rejectAssetPublication(
    serviceDb,
    id,
    parsed.data.reason,
  );
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
      scope: "api/internal/character-asset-publications/[id]/reject#POST",
      event: "asset_publication_rejected",
      publicationId: id,
      actor: parsed.data.actor ?? null,
    }),
  );
  return NextResponse.json({ ok: true });
}
