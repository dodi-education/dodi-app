import { NextResponse } from "next/server";

import { requireAuth } from "@/lib/resolve-auth";
import { getPersona } from "@/services/personas";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const persona = await getPersona(supabase, id);
    if (!persona || (!persona.is_system_default && persona.account_id !== accountId)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const filename = `${persona.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.soul.md`;

    return new NextResponse(persona.soul, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to export persona" },
      { status: 500 },
    );
  }
}
