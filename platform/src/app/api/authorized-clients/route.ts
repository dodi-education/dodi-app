import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { listAuthorizedClients } from "@/services/authorized-clients";

/**
 * The Access list: every browser, app, robot and agent that can open this
 * family's vault, plus signed-in sessions that never unlocked it.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const currentDevice = request.headers.get("x-dodi-device-id");
  try {
    const clients = await listAuthorizedClients(
      auth.db,
      serviceDb,
      auth.accountId,
      {
        sessionId: auth.sessionId ?? null,
        deviceId: currentDevice,
      },
    );
    return NextResponse.json({ clients });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list access",
      "api/authorized-clients#GET",
      {
        accountId: auth.accountId,
      },
    );
  }
}
