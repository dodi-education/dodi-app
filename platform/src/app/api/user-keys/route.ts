/**
 * GET /api/user-keys — the login's personal key (see @dodi/vault member-keys).
 * PUT /api/user-keys — replace its wraps (password change, a new device). The
 *     public keys never change here: families wrapped their key to them.
 *
 * A login, not a family, owns these, so a login between families can still
 * reach them. Opaque to the server.
 */
import { NextResponse } from "next/server";

import { PutUserKeysBodySchema } from "@dodi/protocol/family-members";
import type { StoredVaultKeys } from "@dodi/vault";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireLogin } from "@/lib/resolve-auth";
import { getUserKeys, setUserVaultKeys } from "@/services/user-keys";

export async function GET(request: Request): Promise<Response> {
  const login = await requireLogin(request);
  if (login instanceof Response) return login;
  try {
    return NextResponse.json({ userKeys: await getUserKeys(serviceDb, login.userId) });
  } catch (error) {
    return serverErrorResponse(error, "Failed to load keys", "api/user-keys#GET");
  }
}

export async function PUT(request: Request): Promise<Response> {
  const login = await requireLogin(request);
  if (login instanceof Response) return login;
  const parsed = PutUserKeysBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const saved = await setUserVaultKeys(
      serviceDb,
      login.userId,
      parsed.data.vaultKeys as StoredVaultKeys,
    );
    if (!saved) return NextResponse.json({ error: "No keys to update" }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, "Failed to save keys", "api/user-keys#PUT");
  }
}
