import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@/lib/logger";
import { getProfile } from "@/lib/services/profiles";

const log = createLogger("game-create");
import { getGame } from "@/lib/services/games";
import {
  createCustomGame,
  listGames,
} from "@/lib/services/games";
import { generateCustomGame } from "@/lib/services/game-generation";
import { logMemoryEvent } from "@/lib/services/system-logs";
import {
  getTranslation,
  getTranslationsForGames,
  applyTranslation,
} from "@/lib/services/game-translations";

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

  let locale = "en";
  if (profileId) {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    locale = profile.language;
  }

  try {
    const games = await listGames(supabase, {
      profileId,
      includeSystem,
      search,
      subject,
      tags,
    });

    const translations = await getTranslationsForGames(
      supabase,
      games.map((g) => g.id),
      locale,
    );

    const translatedGames = games.map((game) =>
      applyTranslation(game, translations.get(game.id)),
    );

    return NextResponse.json(translatedGames);
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
  log.info("creation_requested", { profileId, promptLength: prompt.length, baseGameId });
  log.debug("creation_prompt", { profileId, prompt });

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
      const baseTranslation = await getTranslation(supabase, baseGame.id, profile.language);
      const translatedBase = applyTranslation(baseGame, baseTranslation);
      generationPrompt = [
        `Create a remix inspired by the base game \"${translatedBase.title}\".`,
        `Base game description: ${translatedBase.description}`,
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

    log.info("game_generated", {
      profileId,
      title: generated.title,
      codeSizeChars: generated.codeBundle.length,
    });

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

    log.info("game_created", { profileId, gameId: created.id, title: created.title });

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
    log.error("creation_failed", { profileId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
