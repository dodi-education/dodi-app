import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import {
  deleteSnapshot,
  getSnapshot,
  markSnapshotViewed,
} from "@/services/snapshots";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Full snapshot (incl. the heavy sealed payload blob), owner-scoped. */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const snapshot = await getSnapshot(serviceClient(), {
      accountId: auth.accountId,
      id,
    });
    if (!snapshot) {
      return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
    }
    return NextResponse.json(snapshot);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch snapshot",
      "api/snapshots/[id]#GET",
      { accountId: auth.accountId },
    );
  }
}

const PatchSchema = z.object({
  viewed: z.literal(true),
});

/** Mark a received snapshot as viewed (clears the "new" badge). */
export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body: unknown = await request.json().catch(() => null);
  const result = PatchSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    await markSnapshotViewed(serviceClient(), { accountId: auth.accountId, id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update snapshot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  try {
    await deleteSnapshot(serviceClient(), { accountId: auth.accountId, id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete snapshot";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
