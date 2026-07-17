import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { createOwnSnapshot, listSnapshots } from "@/services/snapshots";

/** A kid's snapshot collection (light rows — no payload blob). Requires ?kidId=. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const kidId = new URL(request.url).searchParams.get("kidId");
  if (!kidId) {
    return NextResponse.json({ error: "kidId is required" }, { status: 400 });
  }

  try {
    const snapshots = await listSnapshots(serviceClient(), {
      accountId: auth.accountId,
      kidId,
    });
    return NextResponse.json(snapshots);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch snapshots",
      "api/snapshots#GET",
      { accountId: auth.accountId },
    );
  }
}

const CreateSchema = z.object({
  kidId: z.string().uuid(),
  gameId: z.string().uuid().nullable(),
  // Opaque sealed blobs (enc:v1: under the account VMK); server stays blind.
  infoEnc: z.string().min(1).max(300_000),
  payloadEnc: z.string().min(1).max(2_000_000),
  payloadBytes: z.number().int().nonnegative(),
});

/** Store one of the caller's kid's own snapshots. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body: unknown = await request.json().catch(() => null);
  const result = CreateSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const created = await createOwnSnapshot(serviceClient(), {
      accountId: auth.accountId,
      kidId: result.data.kidId,
      gameId: result.data.gameId,
      infoEnc: result.data.infoEnc,
      payloadEnc: result.data.payloadEnc,
      payloadBytes: result.data.payloadBytes,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save snapshot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
