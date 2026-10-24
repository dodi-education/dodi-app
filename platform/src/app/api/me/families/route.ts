/** GET /api/me/families — every family the signed-in login belongs to (the switcher). */
import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireLogin } from "@/lib/resolve-auth";
import { getSessionActiveAccount, listFamiliesForUser } from "@/services/account-members";

export async function GET(request: Request): Promise<Response> {
  const login = await requireLogin(request);
  if (login instanceof Response) return login;
  try {
    const active = await getSessionActiveAccount(serviceDb, login.sessionId);
    return NextResponse.json({
      families: await listFamiliesForUser(serviceDb, login.userId, active),
    });
  } catch (error) {
    return serverErrorResponse(error, "Failed to load your families", "api/me/families#GET");
  }
}
