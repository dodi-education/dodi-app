import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { lookupFriendTarget } from "@/services/friends";

const LookupSchema = z.object({ socialId: z.string().min(3).max(30) });

/**
 * Resolve a friend code (social_id) to the public keys needed to send a
 * request. Cross-account read via the service role; returns 404 unless the
 * target is discoverable. Never exposes a name or a browsable list.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body: unknown = await request.json().catch(() => null);
  const result = LookupSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const target = await lookupFriendTarget(serviceClient(), result.data.socialId);
    if (!target) {
      return NextResponse.json(
        { error: "No kid found for that friend code" },
        { status: 404 },
      );
    }
    return NextResponse.json(target);
  } catch (error) {
    return serverErrorResponse(error, "Lookup failed", "api/friends/lookup#POST", {
      accountId: auth.accountId,
    });
  }
}
