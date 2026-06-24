import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import {
  deleteProfile,
  getProfile,
  updateProfile,
} from "@/services/profiles";

const UpdateProfileSchema = z.object({
  // Personal fields (display_name, birthdate, parent_notes) arrive as opaque
  // client-encrypted ciphertext. social_id stays plaintext (public handle).
  display_name: z.string().min(1).max(2000).optional(),
  social_id: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers, and hyphens")
    .optional(),
  birthdate: z.string().max(2000).nullable().optional(),
  language: z.string().min(2).max(5).optional(),
  active_persona_id: z.string().uuid().nullable().optional(),
  first_interaction: z.boolean().optional(),
  memory: z.string().max(100000).nullable().optional(),
  parent_notes: z.string().max(200000).nullable().optional(),
  avatar_config: z.record(z.string(), z.any()).nullable().optional(),
  preferences: z.record(z.string(), z.any()).nullable().optional(),
});

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
    const profile = await getProfile(supabase, id);
    if (!profile || profile.account_id !== accountId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(profile);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  // Verify ownership
  const existing = await getProfile(supabase, id);
  if (!existing || existing.account_id !== accountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body: unknown = await request.json();
  const result = UpdateProfileSchema.safeParse(body);

  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const profile = await updateProfile(supabase, id, result.data);
    return NextResponse.json(profile);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  // Verify ownership
  const existing = await getProfile(supabase, id);
  if (!existing || existing.account_id !== accountId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await deleteProfile(supabase, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete profile" },
      { status: 500 },
    );
  }
}
