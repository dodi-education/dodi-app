import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { serviceDb } from "@/lib/db";
import { OpsAccountsQuerySchema, listOpsAccounts } from "@/services/ops-lists";

/**
 * One page of accounts for the ops console. Ops m2m only — /api/internal auth,
 * see lib/internal-auth. Plaintext operational columns only: no vault material
 * and nothing from `kids` beyond a row count.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = OpsAccountsQuerySchema.safeParse(
    Object.fromEntries(searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const accounts = await listOpsAccounts(serviceDb, parsed.data);
    return NextResponse.json(accounts);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list accounts",
      "api/internal/accounts#GET",
      {},
    );
  }
}
