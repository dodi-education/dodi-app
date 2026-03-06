import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/services/profiles";
import { getGame } from "@/lib/services/games";
import {
  createCustomGame,
  listGames,
} from "@/lib/services/games";
import { generateCustomGame } from "@/lib/services/game-generation";
import { logMemoryEvent } from "@/lib/services/system-logs";

const CreateGameSchema = z.object({
  profileId: z.string().uuid(),
  prompt: z.string().min(2).max(5000),
  baseGameId: z.string().uuid().optional(),
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

export async function GET(request: Request): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const subject = searchParams.get("subject") ?? undefined;
  const includeSystem = searchParams.get("includeSystem") !== "false";
  const tags = searchParams.getAll("tag").filter(Boolean);

  if (profileId) {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
  }

  try {
    const games = await listGames(supabase, {
      profileId,
      includeSystem,
      search,
      subject,
      tags,
    });

    return NextResponse.json(games);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch games";
    return NextResponse.json({ error: message }, { status: 500 });
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
  const parsed = CreateGameSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { profileId, prompt, baseGameId } = parsed.data;

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    let generationPrompt = prompt;
    if (baseGameId) {
      const baseGame = await getGame(supabase, baseGameId);
      if (!baseGame) {
        return NextResponse.json({ error: "Base game not found" }, { status: 404 });
      }
      generationPrompt = [
        `Create a remix inspired by the base game \"${baseGame.title}\".`,
        `Base game description: ${baseGame.description}`,
        "",
        `Kid request: ${prompt}`,
      ].join("\n");
    }

    const generated = await generateCustomGame(
      supabase,
      user.id,
      generationPrompt,
      {
        profileName: profile.display_name,
        age: getAgeFromBirthdate(profile.birthdate),
        language: profile.language,
      },
    );

    const created = await createCustomGame(supabase, {
      accountId: user.id,
      profileId,
      sourceGameId: baseGameId ?? null,
      title: generated.title,
      description: generated.description,
      subject: generated.subject,
      difficulty: generated.difficulty,
      targetAgeMin: generated.targetAgeMin,
      targetAgeMax: generated.targetAgeMax,
      estimatedDurationMinutes: generated.estimatedDurationMinutes,
      tags: generated.tags,
      codeBundle: generated.codeBundle,
      markdown: generated.markdown,
      metadata: generated.metadata,
      createdBy: "ai",
    });

    logMemoryEvent(supabase, {
      profile_id: profile.id,
      account_id: user.id,
      persona_id: profile.active_persona_id,
      event: "game_created",
      message: `Created game: ${created.title}`,
    }).catch(() => {
      // non-blocking
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
