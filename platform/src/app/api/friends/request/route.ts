import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { createFriendRequest } from "@/services/friends";

const RequestSchema = z.object({
  requesterKidId: z.string().uuid(),
  targetKidId: z.string().uuid(),
  // Sealed SealedEnvelope JSON strings (opaque to the server).
  previewCard: z.string().min(1).max(50000),
  fullCard: z.string().min(1).max(50000),
  // Requester's private nickname, client-encrypted under their VMK (opaque, required).
  nickname: z.string().min(1).max(50000),
});

/** Send a friend request from one of the caller's kids to a target kid. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body: unknown = await request.json().catch(() => null);
  const result = RequestSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const row = await createFriendRequest(serviceClient(), {
      requesterAccountId: auth.accountId,
      requesterKidId: result.data.requesterKidId,
      targetKidId: result.data.targetKidId,
      previewCard: result.data.previewCard,
      fullCard: result.data.fullCard,
      nickname: result.data.nickname,
    });
    return NextResponse.json({ id: row.id, status: row.status }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send friend request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
