import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { publishFriendKeys } from "@/services/friends";

const FriendKeysSchema = z.object({
  kemPublicKey: z.string().min(1).max(10000),
  signPublicKey: z.string().min(1).max(10000),
  // Opaque enc:v1: blob of the profile's secret keys, sealed under the VMK.
  sealedSecretKeys: z.string().min(1).max(50000),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Publish (or rotate) a kid profile's friend identity. Owner-scoped. */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json().catch(() => null);
  const result = FriendKeysSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    await publishFriendKeys(supabase, {
      accountId,
      profileId: id,
      kemPublicKey: result.data.kemPublicKey,
      signPublicKey: result.data.signPublicKey,
      sealedSecretKeys: result.data.sealedSecretKeys,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to publish friend keys";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
