/**
 * GET  /api/ai/providers — return the account's opaque, client-encrypted
 *                          provider-keys blob (server can't read it).
 * PUT  /api/ai/providers — store it (client decrypts → modifies → re-encrypts).
 *
 * The server never sees a plaintext key. Provider add/remove/validate happen
 * entirely client-side (see src/stores/providers-store.ts).
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import {
  getEncryptedProviders,
  setEncryptedProviders,
} from "@/services/ai-providers";

const PutSchema = z.object({
  encryptedProviders: z.string().min(1),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const encryptedProviders = await getEncryptedProviders(supabase, accountId);
    return NextResponse.json({ encryptedProviders });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch providers" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await setEncryptedProviders(supabase, accountId, parsed.data.encryptedProviders);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save providers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
