import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { cloneGameToCustom, getGame } from "@/lib/services/games";
import { getProfile } from "@/lib/services/profiles";
import { logMemoryEvent } from "@/lib/services/system-logs";

const CloneGameSchema = z.object({
  profileId: z.string().uuid(),
  title: z.string().min(1).max(120).optional(),
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

  const body: unknown = await request.json();
  const parsed = CloneGameSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, title } = parsed.data;

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const source = await getGame(supabase, id);
    if (!source) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    const cloned = await cloneGameToCustom(supabase, id, user.id, profileId, {
      title,
      createdBy: "kid",
    });

    logMemoryEvent(supabase, {
      profile_id: profile.id,
      account_id: user.id,
      persona_id: profile.active_persona_id,
      event: "game_cloned",
      message: `Cloned game \"${source.title}\" as \"${cloned.title}\"`,
    }).catch(() => {
      // non-blocking
    });

    return NextResponse.json(cloned, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clone game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
