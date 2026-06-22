import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { createClient } from "@/lib/supabase/server";
import { createLogger } from "@dodi/platform/logger";
import { getProfile } from "@dodi/platform/services/profiles";

const log = createLogger("game-create");
import {
  createCustomGame,
  listGames,
  replaceGameSharings,
} from "@dodi/platform/services/games";
import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";
import {
  getTranslationsForGames,
  applyTranslation,
} from "@dodi/platform/services/game-translations";

/** Extract a useful message from an Error or a Supabase PostgrestError-like object. */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint].filter(
      (x): x is string => typeof x === "string" && x.length > 0,
    );
    if (parts.length) return parts.join(" — ");
    if (typeof o.code === "string") return `Database error ${o.code}`;
  }
  return "Failed to save game";
}

/**
 * POST body — create a game. The code comes from one of:
 *  - `codeBundle` → an already-built bundle is persisted as-is.
 *  - neither   → a "not built yet" placeholder (built later via the parent studio).
 * Publication is just `isActive`; lifecycle ("built yet?") is read from the
 * bundle's marker, not a status field. Updating a game is `PATCH /api/games/:id`.
 */
const CreateGameSchema = z.object({
  profileId: z.string().uuid(),
  codeBundle: z.string().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(5000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  markdown: z.string().max(100000).optional(),
  learningGoal: z.string().max(2000).optional(),
  successDefinition: z.string().max(2000).optional(),
  isActive: z.boolean().optional(),
  audience: z
    .object({
      isFamily: z.boolean(),
      audienceIds: z.array(z.string().uuid()),
    })
    .optional(),
});

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

  const data = parsed.data;
  const { profileId } = data;

  try {
    const profile = await getProfile(supabase, profileId);
    if (!profile || profile.account_id !== user.id) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Persist a provided bundle, or a "not built yet" placeholder when none.
    // `createCustomGame` sanitizes the bundle; the placeholder's marker lets
    // the UI tell an unbuilt game from a real one (see lib/games/placeholder).
    if (!data.title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    const hasCode = !!data.codeBundle;
    const created = await createCustomGame(supabase, {
      accountId: user.id,
      profileId,
      title: data.title,
      description: data.description,
      tags: data.tags,
      markdown: data.markdown,
      codeBundle: hasCode ? data.codeBundle! : UNBUILT_GAME_PLACEHOLDER,
      learningGoal: data.learningGoal ?? "",
      successDefinition: data.successDefinition ?? "",
      progressKind: data.successDefinition?.trim() ? "goal" : "open",
      createdBy: "parent",
      // Real code is playable; an unbuilt placeholder is not (caller may override).
      isActive: data.isActive ?? hasCode,
    });

    if (data.audience) {
      await replaceGameSharings(supabase, created.id, user.id, {
        family: data.audience.isFamily,
        profileIds: data.audience.audienceIds,
      });
    }
    log.info("game_saved", { profileId, gameId: created.id, built: hasCode });

    log.info("game_created", { profileId, gameId: created.id, title: created.title });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = describeError(error);
    log.error("creation_failed", { profileId, error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
