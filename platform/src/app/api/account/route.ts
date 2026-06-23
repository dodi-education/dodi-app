import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { getAccount } from "@/services/accounts";

/** User-authed: the caller's account (subscription tier, etc.). */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const account = await getAccount(auth.supabase, auth.accountId);
  return NextResponse.json({ account });
}
