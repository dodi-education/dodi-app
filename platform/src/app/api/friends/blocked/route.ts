import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { listBlocked } from "@/services/friends";

/** Kids this kid has blocked. ?kidId= required. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  const kidId = new URL(request.url).searchParams.get("kidId");
  if (!kidId) {
    return NextResponse.json({ error: "kidId is required" }, { status: 400 });
  }

  try {
    const blocked = await listBlocked(serviceClient(), {
      accountId: auth.accountId,
      kidId,
    });
    return NextResponse.json(blocked);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch blocked list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
