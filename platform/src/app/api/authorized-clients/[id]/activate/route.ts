import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { activateClient } from "@/services/authorized-clients";

interface Ctx {
  params: Promise<{ id: string }>;
}

const ActivateSchema = z.object({
  /** Agents: what the parent granted (narrows the request). */
  scopes: z.array(z.string()).max(20).optional(),
  expiresInDays: z.number().int().nullable().optional(),
});

/**
 * Parent: allow a claimed robot or agent (after its vault wrap is stored),
 * from the signed-in, unlocked parent area. For an agent, with the grant
 * `{ scopes, expiresInDays }`. Devices and agents can't allow anything.
 */
export async function POST(request: Request, context: Ctx): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  if (auth.via !== "user") {
    return NextResponse.json({ error: "Only a signed-in parent can allow access" }, { status: 403 });
  }
  const { id } = await context.params;
  const parsed = ActivateSchema.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", issues: parsed.error.issues }, { status: 400 });
  }

  const grant = parsed.data.scopes
    ? { scopes: parsed.data.scopes, expiresInDays: parsed.data.expiresInDays ?? null }
    : undefined;
  try {
    const client = await activateClient(auth.db, auth.accountId, id, grant);
    return NextResponse.json({ client });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
