/**
 * GET  /api/vault/keys — return the authenticated account's wrapped vault keys.
 * PUT  /api/vault/keys — store them (bootstrap, password change, add/remove device).
 *
 * The server validates only the STRUCTURE of the blob and stores it verbatim —
 * it never inspects or decrypts the key material.
 */
import { NextResponse } from "next/server";

import { StoredVaultKeysSchema } from "@dodi/protocol/schemas";

import { logServerError } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { createLogger } from "@/logger";
import {
  getStoredVaultKeys,
  setStoredVaultKeys,
} from "@/services/vault-keys";
import type { StoredVaultKeys } from "@dodi/vault";

const log = createLogger("vault-keys");

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const vaultKeys = await getStoredVaultKeys(supabase, accountId);
    return NextResponse.json({ vaultKeys });
  } catch (error) {
    logServerError("api/vault/keys#GET", error, {
      accountId,
      httpStatus: 500,
    });
    const message =
      error instanceof Error ? error.message : "Failed to load vault keys";
    log.error("get_failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = StoredVaultKeysSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    await setStoredVaultKeys(supabase, accountId, parsed.data as StoredVaultKeys);
    return NextResponse.json({ ok: true });
  } catch (error) {
    logServerError("api/vault/keys#PUT", error, {
      accountId,
      httpStatus: 500,
    });
    const message =
      error instanceof Error ? error.message : "Failed to store vault keys";
    log.error("put_failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
