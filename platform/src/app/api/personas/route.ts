import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { getAccount } from "@/services/accounts";
import { createPersona, listPersonas } from "@/services/personas";

// Account personas are E2EE: `name` and `soul` arrive as opaque `enc:v1:`
// ciphertext, so these only bound the ciphertext (the client enforces the
// plaintext limits before sealing). The server never reads the plaintext.
const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(2000),
  soul: z.string().min(1).max(200000),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const personas = await listPersonas(supabase, accountId);
    return NextResponse.json(personas);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch personas" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const result = CreatePersonaSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  // Entitlement gate: cap custom personas at the account's copied max_custom_personas
  // (listPersonas also returns the global default, which has a null account_id).
  const account = await getAccount(supabase, accountId);
  const personas = await listPersonas(supabase, accountId);
  const customCount = personas.filter((p) => p.account_id === accountId).length;
  if (account && customCount >= account.max_custom_personas) {
    return NextResponse.json(
      { error: "persona_limit_reached", limit: account.max_custom_personas },
      { status: 409 },
    );
  }

  try {
    const persona = await createPersona(supabase, {
      account_id: accountId,
      name: result.data.name,
      soul: result.data.soul,
    });
    return NextResponse.json(persona, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create persona";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
