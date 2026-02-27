import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createProfile, listProfiles } from "@/lib/services/profiles";

const CreateProfileSchema = z.object({
  display_name: z.string().min(1).max(50),
  name_tag: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens"),
  birthdate: z.string().optional(),
  language: z.string().min(2).max(5).optional(),
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
    const profiles = await listProfiles(supabase, user.id);
    return NextResponse.json(profiles);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch profiles" },
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
  const result = CreateProfileSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const profile = await createProfile(supabase, {
      account_id: user.id,
      display_name: result.data.display_name,
      name_tag: result.data.name_tag,
      birthdate: result.data.birthdate ?? null,
      language: result.data.language,
    });
    return NextResponse.json(profile, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create profile";
    const isConflict = message.includes("duplicate");
    return NextResponse.json(
      { error: isConflict ? "Name tag already taken" : message },
      { status: isConflict ? 409 : 500 },
    );
  }
}
