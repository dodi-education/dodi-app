import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import {
  getAutosaveSnapshot,
  upsertAutosaveSnapshot,
} from "@/services/snapshots";

/**
 * A kid's autosave slot for a game — one hidden `origin='autosave'` row per
 * (kid, game), overwritten on every save so play resumes where the kid left
 * off. Requires ?kidId= and ?gameId=; 404 when the game has no autosave yet.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const params = new URL(request.url).searchParams;
  const kidId = params.get("kidId");
  const gameId = params.get("gameId");
  if (!kidId || !gameId) {
    return NextResponse.json(
      { error: "kidId and gameId are required" },
      { status: 400 },
    );
  }

  try {
    const snapshot = await getAutosaveSnapshot(serviceClient(), {
      accountId: auth.accountId,
      kidId,
      gameId,
    });
    if (!snapshot) {
      return NextResponse.json({ error: "autosave_not_found" }, { status: 404 });
    }
    return NextResponse.json(snapshot);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch autosave";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

const UpsertSchema = z.object({
  kidId: z.string().uuid(),
  gameId: z.string().uuid(),
  // Opaque sealed blobs (enc:v1: under the account VMK); server stays blind.
  infoEnc: z.string().min(1).max(300_000),
  payloadEnc: z.string().min(1).max(2_000_000),
  payloadBytes: z.number().int().nonnegative(),
});

/** Overwrite (or create) the caller's kid's autosave slot for a game. */
export async function PUT(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body: unknown = await request.json().catch(() => null);
  const result = UpsertSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const saved = await upsertAutosaveSnapshot(serviceClient(), {
      accountId: auth.accountId,
      kidId: result.data.kidId,
      gameId: result.data.gameId,
      infoEnc: result.data.infoEnc,
      payloadEnc: result.data.payloadEnc,
      payloadBytes: result.data.payloadBytes,
    });
    return NextResponse.json(saved);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to save autosave";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
