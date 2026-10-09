import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serviceDb } from "@/lib/db";
import { isUniqueViolation } from "@/lib/db-errors";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { createAccessKeyClient } from "@/services/authorized-clients";
import { consumeRateLimit } from "@/services/rate-limits";

const ACCESS_KEY_LIMIT = {
  bucket: "access_key",
  limit: 20,
  windowMs: 3_600_000,
};

const AccessKeySchema = z.object({
  deviceId: z.string().regex(/^[0-9a-f]{24}$/),
  kemPublicKey: z.string().min(16).max(4000),
  signPublicKey: z.string().min(16).max(4000),
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.string()).min(1).max(20),
  expiresInDays: z.number().int().nullable(),
});

/**
 * Parent: create an access key's agent in one step (no pairing code, no
 * approval: the parent is creating it themselves in the signed-in, unlocked
 * parent area). The browser has already stored the agent's vault wrap; the
 * seed that derives the agent's keys never leaves the browser.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (auth.via !== "user") {
    return NextResponse.json(
      { error: "Only a signed-in parent can create access keys" },
      { status: 403 },
    );
  }
  const parsed = AccessKeySchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const limit = await consumeRateLimit(serviceDb, {
    accountId: auth.accountId,
    ...ACCESS_KEY_LIMIT,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many access keys, try again later", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }
  try {
    const client = await createAccessKeyClient(
      auth.db,
      auth.accountId,
      parsed.data,
    );
    return NextResponse.json({ client: { id: client.id } }, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error))
      return NextResponse.json(
        { error: "Duplicate device id" },
        { status: 409 },
      );
    if (error instanceof Error && error.message.startsWith("Expiry")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return serverErrorResponse(
      error,
      "Failed to create access key",
      "api/authorized-clients/access-keys#POST",
      {
        accountId: auth.accountId,
      },
    );
  }
}
