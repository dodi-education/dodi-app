import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { activateDevice } from "@/services/devices";

interface Ctx {
  params: Promise<{ id: string }>;
}

/** User-authed: activate a claimed device (after its VMK wrap is stored). */
export async function POST(request: Request, context: Ctx): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { id } = await context.params;
  try {
    const device = await activateDevice(auth.supabase, auth.accountId, id);
    return NextResponse.json({ device });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
