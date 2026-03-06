import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { remixCustomGame } from "@/lib/services/game-generation";
import { getProfile } from "@/lib/services/profiles";
import { getGame, updateCustomGame } from "@/lib/services/games";
import { logMemoryEvent } from "@/lib/services/system-logs";

const RemixGameSchema = z.object({
  profileId: z.string().uuid(),
  instruction: z.string().min(2).max(5000),
  gameState: z.record(z.string(), z.unknown()).optional(),
});

function getAgeFromBirthdate(birthdate: string | null): number | undefined {
  if (!birthdate) return undefined;
  const birth = new Date(birthdate);
  if (Number.isNaN(birth.getTime())) return undefined;

  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age > 0 ? age : undefined;
}

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
  const parsed = RemixGameSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, instruction, gameState } = parsed.data;

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const game = await getGame(supabase, id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (game.is_system) {
      return NextResponse.json(
        { error: "Cannot remix a system game in place. Clone it first." },
        { status: 403 },
      );
    }

    const remixed = await remixCustomGame(supabase, user.id, {
      profileName: profile.display_name,
      age: getAgeFromBirthdate(profile.birthdate),
      language: profile.language,
      currentGame: game,
      instruction,
      currentState: gameState,
    });

    const updated = await updateCustomGame(supabase, game.id, {
      title: remixed.title,
      description: remixed.description,
      subject: remixed.subject,
      difficulty: remixed.difficulty,
      target_age_min: remixed.targetAgeMin,
      target_age_max: remixed.targetAgeMax,
      estimated_duration_minutes: remixed.estimatedDurationMinutes,
      tags: remixed.tags,
      code_bundle: remixed.codeBundle,
      markdown: remixed.markdown,
      metadata: remixed.metadata,
      created_by: "ai",
    });

    logMemoryEvent(supabase, {
      profile_id: profile.id,
      account_id: user.id,
      persona_id: profile.active_persona_id,
      event: "game_remixed",
      message: `Remixed game \"${updated.title}\" from instruction: ${instruction}`,
    }).catch(() => {
      // non-blocking
    });

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remix game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
