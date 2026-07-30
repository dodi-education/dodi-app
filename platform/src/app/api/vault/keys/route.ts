/**
 * GET  /api/vault/keys — return the authenticated account's wrapped vault keys.
 * PUT  /api/vault/keys — store them (bootstrap, password change, add/remove
 *      device), optionally binding the account's npub (set-once, at bootstrap).
 *
 * The server validates only the STRUCTURE of the blob and stores it verbatim —
 * it never inspects or decrypts the key material, and never sees the nsec
 * (the body schema has no such field; only the public npub travels).
 */
import { NextResponse } from "next/server";

import { PutVaultKeysBodySchema } from "@dodi/protocol/schemas";

import { logServerError } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { createLogger } from "@/logger";
import { claimAccountNpub } from "@/services/accounts";
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
  const parsed = PutVaultKeysBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  // npub is a queryable account column, NOT part of the opaque blob — split it
  // off so it can never leak into vault_keys.
  const { npub, ...keys } = parsed.data;

  try {
    // Claim the npub BEFORE storing keys: a double-bound npub must abort the
    // whole bootstrap, not persist a vault the client then can't identify.
    if (npub) {
      const claimed = await claimAccountNpub(supabase, accountId, npub);
      if (!claimed) {
        return NextResponse.json({ error: "npub-conflict" }, { status: 409 });
      }
    }
    await setStoredVaultKeys(supabase, accountId, keys as StoredVaultKeys);
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
