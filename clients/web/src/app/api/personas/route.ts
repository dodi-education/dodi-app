import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createPersona, listPersonas } from "@dodi/platform/services/personas";

const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(100),
  soul: z.string().min(1).max(50000),
});

export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const personas = await listPersonas(supabase, user.id);
    return NextResponse.json(personas);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch personas" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body: unknown = await request.json();
  const result = CreatePersonaSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const persona = await createPersona(supabase, {
      account_id: user.id,
      name: result.data.name,
      soul: result.data.soul,
    });
    return NextResponse.json(persona, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create persona";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
