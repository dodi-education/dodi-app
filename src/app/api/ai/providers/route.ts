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

import { createClient } from "@/lib/supabase/server";
import {
  getEncryptedProviders,
  setEncryptedProviders,
} from "@/lib/services/ai-providers";

const PutSchema = z.object({
  encryptedProviders: z.string().min(1),
});

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const encryptedProviders = await getEncryptedProviders(supabase, user.id);
    return NextResponse.json({ encryptedProviders });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch providers" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await setEncryptedProviders(supabase, user.id, parsed.data.encryptedProviders);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save providers";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
