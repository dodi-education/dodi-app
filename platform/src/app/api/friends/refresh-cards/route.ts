import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { refreshFriendCards } from "@/services/friends";

const RefreshSchema = z.object({
  kidId: z.string().uuid(),
  // Re-sealed SealedEnvelope JSON strings (opaque to the server).
  cards: z
    .array(
      z.object({
        friendshipId: z.string().uuid(),
        previewCard: z.string().min(1).max(50000).optional(),
        card: z.string().min(1).max(50000).optional(),
      }),
    )
    .max(500),
});

/**
 * Overwrite this kid's already-sealed friend cards with freshly-sealed ones so
 * friends always see their current name / avatar / birthdate. The server only
 * lets the owner of each side write its own card.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body: unknown = await request.json().catch(() => null);
  const result = RefreshSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const updated = await refreshFriendCards(serviceClient(), {
      accountId: auth.accountId,
      kidId: result.data.kidId,
      cards: result.data.cards,
    });
    return NextResponse.json({ updated });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to refresh cards";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
