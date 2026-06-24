import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { claimDevice } from "@/services/devices";

/** User-authed: claim a pending device by pairing code; returns its KEM pubkey
 *  so the client can wrap the VMK to it before calling /activate. */
export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => null);
  const pairingCode = body?.pairingCode;
  if (!pairingCode) {
    return NextResponse.json({ error: "pairingCode is required" }, { status: 400 });
  }
  try {
    const d = await claimDevice(serviceClient(), pairingCode, auth.accountId);
    return NextResponse.json({
      id: d.id,
      deviceId: d.device_id,
      kemPublicKey: d.kem_public_key,
      signPublicKey: d.sign_public_key,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
