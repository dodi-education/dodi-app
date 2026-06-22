import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createProfile, listProfiles } from "@/lib/services/profiles";
import { generateSocialId } from "@/lib/social-id";

const CreateProfileSchema = z.object({
  // display_name + birthdate arrive as client-encrypted ciphertext (opaque strings).
  display_name: z.string().min(1).max(2000),
  birthdate: z.string().max(2000).optional(),
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

  // social_id is a random public handle assigned server-side. Collisions are
  // astronomically unlikely; retry a few times to be safe.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const profile = await createProfile(supabase, {
        account_id: user.id,
        display_name: result.data.display_name,
        social_id: generateSocialId(),
        birthdate: result.data.birthdate ?? null,
        language: result.data.language,
      });
      return NextResponse.json(profile, { status: 201 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create profile";
      if (message.includes("duplicate")) continue;
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  return NextResponse.json(
    { error: "Could not assign a unique handle, please try again" },
    { status: 500 },
  );
}
