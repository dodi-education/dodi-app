import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { clonePersona, getPersona } from "@dodi/platform/services/personas";

const ClonePersonaSchema = z.object({
  name: z.string().min(1).max(100),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const existing = await getPersona(supabase, id);
  if (!existing || (!existing.is_system_default && existing.account_id !== user.id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body: unknown = await request.json();
  const result = ClonePersonaSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const persona = await clonePersona(supabase, id, user.id, result.data.name);
    return NextResponse.json(persona, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to clone persona";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
