import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { setParentApproval } from "@/services/friends";

const ApproveSchema = z.object({
  side: z.enum(["requester", "addressee"]),
  approve: z.boolean(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** A parent gives (or refuses) final approval for one of their kids' friendships. */
export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const body: unknown = await request.json().catch(() => null);
  const result = ApproveSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const row = await setParentApproval(serviceClient(), {
      accountId: auth.accountId,
      friendshipId: id,
      side: result.data.side,
      approve: result.data.approve,
    });
    return NextResponse.json({ id: row.id, status: row.status });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to set approval";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
