import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { respondToRequest } from "@/services/friends";

const RespondSchema = z.object({
  // The acting kid (the addressee) — disambiguates siblings on one account.
  profileId: z.string().uuid(),
  action: z.enum(["accept", "reject"]),
  // The addressee's full card, sealed to the requester — required to accept.
  addresseeCard: z.string().min(1).max(50000).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** The addressee kid accepts or rejects an incoming request. */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body: unknown = await request.json().catch(() => null);
  const result = RespondSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const row = await respondToRequest(serviceClient(), {
      accountId: auth.accountId,
      profileId: result.data.profileId,
      friendshipId: id,
      action: result.data.action,
      addresseeCard: result.data.addresseeCard,
    });
    return NextResponse.json({ id: row.id, status: row.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to respond";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
