import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { logServerError, serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { createLogger } from "@/logger";
import { getKid } from "@/services/kids";

const log = createLogger("game-create");
import {
  createCustomGame,
  getAccountSharingByGame,
  getFavoriteGameIds,
  listAccountGames,
  listGames,
  replaceGameSharings,
} from "@/services/games";
import { UNBUILT_GAME_PLACEHOLDER } from "@dodi/games/placeholder";
import {
  getTranslationsForGames,
  applyTranslation,
} from "@/services/game-translations";

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
  kidId: z.string().uuid(),
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
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get("scope");
  const kidId = searchParams.get("kidId") ?? undefined;
  const search = searchParams.get("search") ?? undefined;
  const includeSystem = searchParams.get("includeSystem") !== "false";
  const tags = searchParams.getAll("tag").filter(Boolean);

  // Parent studio view: all custom games for the account, each annotated with
  // its sharing state. Canonical titles (no per-kid translation).
  if (scope === "account") {
    try {
      const [games, sharingByGame] = await Promise.all([
        listAccountGames(supabase, accountId),
        getAccountSharingByGame(supabase, accountId),
      ]);
      const withSharing = games.map((game) => ({
        ...game,
        sharing: sharingByGame[game.id] ?? { family: false, kidIds: [] },
      }));
      return NextResponse.json(withSharing);
    } catch (error) {
      return serverErrorResponse(error, "Failed to fetch games", "api/games#GET", {
        accountId,
      });
    }
  }

  let locale = "en";
  if (kidId) {
    const kid = await getKid(supabase, kidId);
    if (!kid || kid.account_id !== accountId) {
      return NextResponse.json({ error: "Kid not found" }, { status: 404 });
    }
    locale = kid.language;
  }

  try {
    const games = await listGames(supabase, {
      kidId,
      includeSystem,
      search,
      tags,
    });

    const translations = await getTranslationsForGames(
      supabase,
      games.map((g) => g.id),
      locale,
    );

    // Kid view carries a per-kid favorite flag so the library can split the grid
    // into favorites vs the rest. Non-kid scopes have no favorites.
    const favoriteIds = kidId
      ? await getFavoriteGameIds(supabase, kidId)
      : new Set<string>();

    const translatedGames = games.map((game) => ({
      ...applyTranslation(game, translations.get(game.id)),
      is_favorite: favoriteIds.has(game.id),
    }));

    return NextResponse.json(translatedGames);
  } catch (error) {
    return serverErrorResponse(error, "Failed to fetch games", "api/games#GET", {
      accountId,
    });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = CreateGameSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const { kidId } = data;

  try {
    const kid = await getKid(supabase, kidId);
    if (!kid || kid.account_id !== accountId) {
      return NextResponse.json({ error: "Kid not found" }, { status: 404 });
    }

    // Persist a provided bundle, or a "not built yet" placeholder when none.
    // `createCustomGame` sanitizes the bundle; the placeholder's marker lets
    // the UI tell an unbuilt game from a real one (see lib/games/placeholder).
    if (!data.title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }
    const hasCode = !!data.codeBundle;
    const created = await createCustomGame(supabase, {
      accountId: accountId,
      kidId,
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
      await replaceGameSharings(supabase, created.id, accountId, {
        family: data.audience.isFamily,
        kidIds: data.audience.audienceIds,
      });
    }
    log.info("game_saved", { kidId, gameId: created.id, built: hasCode });

    log.info("game_created", { kidId, gameId: created.id, title: created.title });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = describeError(error);
    log.error("creation_failed", { kidId, error: message });
    logServerError("api/games#POST", error, { accountId, httpStatus: 500 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
