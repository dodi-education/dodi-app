import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { verifySessionPassword } from "@/lib/auth";
import { serviceDb } from "@/lib/db";
import { requireAuth } from "@/lib/resolve-auth";
import { activateClient } from "@/services/authorized-clients";
import { consumeRateLimit } from "@/services/rate-limits";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** Password attempts are throttled per account, as for account deletion. */
const ACTIVATE_ATTEMPT_LIMIT = {
  bucket: "client_activate",
  limit: 10,
  windowMs: 3_600_000,
};

const ActivateSchema = z.object({
  /** Re-authentication: allowing access hands the client the vault key. */
  password: z.string().min(1).max(500),
  /** Agents: what the parent granted (narrows the request). */
  scopes: z.array(z.string()).max(20).optional(),
  expiresInDays: z.number().int().nullable().optional(),
});

/**
 * Parent: allow a claimed robot or agent (after its vault wrap is stored).
 * Requires the account password again, and for an agent the grant
 * `{ scopes, expiresInDays }`.
 */
export async function POST(request: Request, context: Ctx): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (auth.via !== "user") {
    return NextResponse.json(
      { error: "Only a signed-in parent can allow access" },
      { status: 403 },
    );
  }
  const { id } = await context.params;
  const parsed = ActivateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const attempt = await consumeRateLimit(serviceDb, {
    accountId: auth.accountId,
    ...ACTIVATE_ATTEMPT_LIMIT,
  });
  if (!attempt.allowed) {
    return NextResponse.json(
      { error: "Too many attempts", code: "RATE_LIMITED" },
      { status: 429 },
    );
  }
  if (!(await verifySessionPassword(request.headers, parsed.data.password))) {
    return NextResponse.json(
      { error: "Wrong password", code: "WRONG_PASSWORD" },
      { status: 403 },
    );
  }

  const grant = parsed.data.scopes
    ? {
        scopes: parsed.data.scopes,
        expiresInDays: parsed.data.expiresInDays ?? null,
      }
    : undefined;
  try {
    const client = await activateClient(auth.db, auth.accountId, id, grant);
    return NextResponse.json({ client });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
