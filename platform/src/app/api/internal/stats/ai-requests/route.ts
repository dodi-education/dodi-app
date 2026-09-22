import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceDb } from "@/lib/db";
import { OpsRangeKeySchema, resolveOpsRange } from "@/services/ops-range";
import { getOpsAiRequestShare } from "@/services/ops-stats";

/**
 * AI request volume for one time window, split by upstream provider and by
 * dodi AI vs BYOK. Ops m2m only — /api/internal auth, see lib/internal-auth.
 */
const QuerySchema = z.object({ range: OpsRangeKeySchema.default("30d") });

export async function GET(request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    range: searchParams.get("range") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const stats = await getOpsAiRequestShare(
      serviceDb,
      resolveOpsRange(parsed.data.range),
    );
    return NextResponse.json(stats);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to load ops AI request stats",
      "api/internal/stats/ai-requests#GET",
      {},
    );
  }
}
