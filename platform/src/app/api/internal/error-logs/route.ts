import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceDb } from "@/lib/db";
import {
  OpsErrorLogsQuerySchema,
  listOpsErrorLogs,
} from "@/services/error-logs";

/**
 * The newest error reports across all accounts, newest first, capped at 200.
 * Ops m2m only — /api/internal auth, see lib/internal-auth.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = OpsErrorLogsQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const logs = await listOpsErrorLogs(serviceDb, parsed.data);
    return NextResponse.json(logs);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list error logs",
      "api/internal/error-logs#GET",
      {},
    );
  }
}
