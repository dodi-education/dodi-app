import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceDb } from "@/lib/db";
import { createPendingClient } from "@/services/authorized-clients";

/**
 * Public: a robot or agent enrolls with its public keys and gets a pairing code. The
 * dodi CLI enrolls with `kind: "agent"` plus the scopes it asks for.
 */
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
    const { pairingCode } = await createPendingClient(serviceDb, {
      deviceId,
      kemPublicKey,
      signPublicKey,
      name: typeof body?.name === "string" ? body.name : null,
      kind: body?.kind === "agent" ? "agent" : "robot",
      scopes: Array.isArray(body?.scopes) ? body.scopes : [],
    });
    return NextResponse.json({ pairingCode });
  } catch (e) {
    return serverErrorResponse(
      e,
      "Failed to enroll",
      "api/authorized-clients/enroll#POST",
    );
  }
}
