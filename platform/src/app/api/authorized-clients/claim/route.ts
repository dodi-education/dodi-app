import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceDb } from "@/lib/db";
import { claimClient, requestedScopes } from "@/services/authorized-clients";
import { consumeRateLimit } from "@/services/rate-limits";

/** Pairing codes are short, so guessing is throttled per account. */
const CLAIM_LIMIT = { bucket: "device_claim", limit: 20, windowMs: 3_600_000 };

/** User-authed: claim a pending robot or agent by pairing code; returns its KEM pubkey
 *  so the client can wrap the VMK to it before calling /activate, and for an
 *  agent the name and scopes it asks for (shown on the approval screen). */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const limit = await consumeRateLimit(serviceDb, {
    accountId: auth.accountId,
    ...CLAIM_LIMIT,
  });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many pairing attempts, try again later" },
      { status: 429 },
    );
  }
  const body = await request.json().catch(() => null);
  const pairingCode = body?.pairingCode;
  if (!pairingCode) {
    return NextResponse.json(
      { error: "pairingCode is required" },
      { status: 400 },
    );
  }
  try {
    const d = await claimClient(serviceDb, pairingCode, auth.accountId);
    return NextResponse.json({
      id: d.id,
      deviceId: d.device_id,
      kemPublicKey: d.kem_public_key,
      signPublicKey: d.sign_public_key,
      name: d.name,
      kind: d.kind,
      requestedScopes: requestedScopes(d),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
