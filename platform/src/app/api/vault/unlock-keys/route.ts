/**
 * GET /api/vault/unlock-keys — what the signed-in person opens their family's
 * vault with (@dodi/protocol/family-members UnlockKeys). The owner gets the
 * family's own blob, like GET /api/vault/keys; anyone else gets their
 * personal key, the family's VMK wrapped to it, and the family's check value.
 * All of it opaque to the server.
 */
import { NextResponse } from "next/server";

import type { KemWrappedKey } from "@dodi/crypto";
import type { UnlockKeys } from "@dodi/protocol/family-members";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getUserKeys } from "@/services/user-keys";
import { getStoredVaultKeys } from "@/services/vault-keys";

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, { memberScope: "any" });
  if (auth instanceof Response) return auth;
  if (auth.via !== "user" || !auth.userId) {
    return NextResponse.json({ error: "Only a person's login can do this" }, { status: 403 });
  }
  const { accountId, db, userId } = auth;
  try {
    const family = await getStoredVaultKeys(db, accountId);
    if (auth.role === "owner") {
      const body: UnlockKeys = { kind: "account", keys: family };
      return NextResponse.json(body);
    }
    const [userKeys, membership] = await Promise.all([
      getUserKeys(db, userId),
      serviceDb
        .selectFrom("account_members")
        .select("member_vmk_wrap")
        .where("account_id", "=", accountId)
        .where("user_id", "=", userId)
        .executeTakeFirst(),
    ]);
    const body: UnlockKeys = {
      kind: "member",
      userKeys,
      memberWrap: (membership?.member_vmk_wrap ?? null) as KemWrappedKey | null,
      familyVmkCheck: family?.vmkCheck ?? null,
    };
    return NextResponse.json(body);
  } catch (error) {
    return serverErrorResponse(error, "Failed to load vault keys", "api/vault/unlock-keys#GET", {
      accountId,
    });
  }
}
