import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { registerOwnClient } from "@/services/authorized-clients";

const RegisterSchema = z.object({
  deviceId: z.string().min(8).max(100),
  kemPublicKey: z.string().min(16).max(4000),
  kind: z.enum(["browser", "app"]),
  label: z.string().trim().max(80).nullable().default(null),
});

/**
 * A signed-in browser or the app records itself after adding its own vault
 * wrap (and on later unlocks), linked to its login session, so it shows in
 * the Access list and can be revoked.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (auth.via !== "user") {
    return NextResponse.json(
      { error: "Only a signed-in browser or app registers itself" },
      { status: 403 },
    );
  }
  const parsed = RegisterSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    await registerOwnClient(auth.db, auth.accountId, {
      ...parsed.data,
      sessionId: auth.sessionId ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to register",
      "api/authorized-clients/register#POST",
      {
        accountId: auth.accountId,
      },
    );
  }
}
