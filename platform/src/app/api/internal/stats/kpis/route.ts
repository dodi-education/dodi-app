import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceDb } from "@/lib/db";
import { OpsRangeKeySchema, resolveOpsRange } from "@/services/ops-range";
import { getOpsKpis } from "@/services/ops-stats";

/**
 * The ops console's KPI strip for one time window. Ops m2m only —
 * /api/internal auth, see lib/internal-auth. Cross-account by definition, so it
 * runs on the BYPASSRLS handle; the service reads counts and timestamps only.
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
    const kpis = await getOpsKpis(serviceDb, resolveOpsRange(parsed.data.range));
    return NextResponse.json(kpis);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to load ops KPIs",
      "api/internal/stats/kpis#GET",
      {},
    );
  }
}
