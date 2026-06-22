/**
 * GET  /api/vault/keys — return the authenticated account's wrapped vault keys.
 * PUT  /api/vault/keys — store them (bootstrap, password change, add/remove device).
 *
 * The server validates only the STRUCTURE of the blob and stores it verbatim —
 * it never inspects or decrypts the key material.
 */
import { NextResponse } from "next/server";

import { StoredVaultKeysSchema } from "@dodi/protocol/schemas";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@dodi/platform/logger";
import {
  getStoredVaultKeys,
  setStoredVaultKeys,
} from "@dodi/platform/services/vault-keys";
import type { StoredVaultKeys } from "@dodi/vault";

const log = createLogger("vault-keys");

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const vaultKeys = await getStoredVaultKeys(supabase, user.id);
    return NextResponse.json({ vaultKeys });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load vault keys";
    log.error("get_failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
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
  const parsed = StoredVaultKeysSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await setStoredVaultKeys(supabase, user.id, parsed.data as StoredVaultKeys);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to store vault keys";
    log.error("put_failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
