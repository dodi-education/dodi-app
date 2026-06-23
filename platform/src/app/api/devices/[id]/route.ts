import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { deleteDevice } from "@/services/devices";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** User-authed: delete a device. */
export async function DELETE(request: Request, context: Ctx): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  try {
    await deleteDevice(auth.supabase, auth.accountId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
