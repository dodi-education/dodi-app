import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { shareSnapshot } from "@/services/snapshots";

const ShareSchema = z.object({
  senderKidId: z.string().uuid(),
  friendshipId: z.string().uuid(),
  // SealedEnvelope JSON strings, sealed client-side to the RECIPIENT kid's
  // friend KEM key and signed by the sender kid (opaque to the server).
  infoEnc: z.string().min(1).max(300_000),
  payloadEnc: z.string().min(1).max(2_000_000),
  payloadBytes: z.number().int().nonnegative(),
});

/**
 * Deliver a snapshot to a friend. The service validates that the sender kid
 * belongs to the caller and shares an ACCEPTED friendship with the recipient —
 * this route is the only writer of `origin='received'` rows.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body: unknown = await request.json().catch(() => null);
  const result = ShareSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const shared = await shareSnapshot(serviceClient(), {
      senderAccountId: auth.accountId,
      senderKidId: result.data.senderKidId,
      friendshipId: result.data.friendshipId,
      infoEnc: result.data.infoEnc,
      payloadEnc: result.data.payloadEnc,
      payloadBytes: result.data.payloadBytes,
    });
    return NextResponse.json({ id: shared.id }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to share snapshot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
