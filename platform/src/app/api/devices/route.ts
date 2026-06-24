import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { listDevices } from "@/services/devices";

/** User-authed: list the account's devices. */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const devices = await listDevices(auth.supabase, auth.accountId);
  return NextResponse.json({ devices });
}
