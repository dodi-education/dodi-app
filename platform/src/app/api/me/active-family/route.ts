/**
 * PUT /api/me/active-family — switch this session to another of the login's
 * families. The client drops its caches and opens that family's vault next.
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireLogin } from "@/lib/resolve-auth";
import { setActiveFamily } from "@/services/account-members";

const BodySchema = z.object({ accountId: z.uuid() });

export async function PUT(request: Request): Promise<Response> {
  const login = await requireLogin(request);
  if (login instanceof Response) return login;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const switched = await setActiveFamily(serviceDb, {
      userId: login.userId,
      sessionId: login.sessionId,
      accountId: parsed.data.accountId,
    });
    if (!switched) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, "Failed to switch family", "api/me/active-family#PUT");
  }
}
