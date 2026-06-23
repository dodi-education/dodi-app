import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { revokeDevice } from "@/services/devices";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** User-authed: revoke a device. The caller should also remove its VMK wrap
 *  from accounts.vault_keys.deviceWraps so it can no longer unwrap the vault. */
export async function POST(request: Request, context: Ctx): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  try {
    const device = await revokeDevice(auth.supabase, auth.accountId, id);
    return NextResponse.json({ device });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
