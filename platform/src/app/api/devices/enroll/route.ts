import { NextResponse } from "next/server";

import { serviceClient } from "@/lib/supabase";
import { createPendingDevice } from "@/services/devices";

/** Public: a device enrolls with its public keys and gets a pairing code. */
export async function POST(request: Request): Promise<Response> {
  const body = await request.json().catch(() => null);
  const deviceId = body?.deviceId;
  const kemPublicKey = body?.kemPublicKey;
  const signPublicKey = body?.signPublicKey;
  if (!deviceId || !kemPublicKey || !signPublicKey) {
    return NextResponse.json(
      { error: "deviceId, kemPublicKey, signPublicKey are required" },
      { status: 400 },
    );
  }
  try {
    const { pairingCode } = await createPendingDevice(serviceClient(), {
      deviceId,
      kemPublicKey,
      signPublicKey,
      name: body?.name ?? null,
    });
    return NextResponse.json({ pairingCode });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
