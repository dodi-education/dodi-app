import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { respondToRequest } from "@/services/friends";
import { notifyPendingApproval } from "@/services/notifications";

const RespondSchema = z.object({
  // The acting kid (the addressee) — disambiguates siblings on one account.
  kidId: z.string().uuid(),
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
    const supabase = serviceClient();
    const row = await respondToRequest(supabase, {
      accountId: auth.accountId,
      kidId: result.data.kidId,
      friendshipId: id,
      action: result.data.action,
      addresseeCard: result.data.addresseeCard,
    });
    // The kid just accepted and a parent's final approval is still needed: email the
    // parent(s) waiting on it. Fire-and-forget — email latency/failure must not
    // affect the kid's response. This edge fires at most once (respondToRequest
    // throws unless the row was still `pending`).
    if (row.status === "awaiting_parent") {
      void notifyPendingApproval(supabase, row);
    }
    return NextResponse.json({ id: row.id, status: row.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to respond";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
