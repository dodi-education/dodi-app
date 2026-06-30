import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { createKid, listKids } from "@/services/kids";
import { generateSocialId } from "@dodi/crypto/social-id";

const CreateKidSchema = z.object({
  // display_name + birthdate arrive as client-encrypted ciphertext (opaque strings).
  display_name: z.string().min(1).max(2000),
  birthdate: z.string().max(2000).optional(),
  language: z.string().min(2).max(5).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const kids = await listKids(supabase, accountId);
    return NextResponse.json(kids);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch kids" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const result = CreateKidSchema.safeParse(body);

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
      const kid = await createKid(supabase, {
        account_id: accountId,
        display_name: result.data.display_name,
        social_id: generateSocialId(),
        birthdate: result.data.birthdate ?? null,
        language: result.data.language,
      });
      return NextResponse.json(kid, { status: 201 });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to create kid";
      if (message.includes("duplicate")) continue;
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }
  return NextResponse.json(
    { error: "Could not assign a unique handle, please try again" },
    { status: 500 },
  );
}
