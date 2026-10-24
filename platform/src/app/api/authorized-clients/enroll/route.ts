import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceDb } from "@/lib/db";
import { createPendingClient } from "@/services/authorized-clients";

/**
 * Public: a robot or agent enrolls with its public keys and gets a pairing code. The
 * dodi CLI enrolls with `kind: "agent"` plus the scopes it asks for.
 *
 * `kemKeySignature` binds the KEM key to the signing key the parent compares
 * by fingerprint (verified in the parent's browser before it wraps the vault
 * key). Agents must send it; a robot whose firmware predates it may not.
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
  const kemKeySignature =
    typeof body?.kemKeySignature === "string" && body.kemKeySignature.length <= 8000
      ? body.kemKeySignature
      : null;
  if (body?.kind === "agent" && !kemKeySignature) {
    return NextResponse.json(
      { error: "This dodi CLI is too old to connect. Update it and try again.", code: "CLI_OUTDATED" },
      { status: 400 },
    );
  }
  try {
    const { pairingCode } = await createPendingClient(serviceDb, {
      deviceId,
      kemPublicKey,
      signPublicKey,
      kemKeySignature,
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
