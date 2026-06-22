import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createPersona } from "@dodi/platform/services/personas";

const MAX_FILE_SIZE = 50000;

export async function POST(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  const name = formData.get("name");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "A .md file is required" },
      { status: 400 },
    );
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json(
      { error: "A name is required" },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: "File is too large (max 50KB)" },
      { status: 400 },
    );
  }

  try {
    const soul = await file.text();
    const persona = await createPersona(supabase, {
      account_id: user.id,
      name: name.trim(),
      soul,
    });
    return NextResponse.json(persona, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to import persona";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
