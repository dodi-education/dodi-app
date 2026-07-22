import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { logServerError, serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
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
import { getGameStats } from "@/services/discover";
import type { GameMetadata } from "@dodi/types/games";
import type { SuccessCriteria } from "@dodi/types/success";
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
 * POST body — create a game. `codeBundle` is required and arrives SEALED: for a
 * game with no code yet the client seals `UNBUILT_GAME_PLACEHOLDER` itself (the
 * server can no longer substitute a plaintext placeholder into an encrypted
 * column). Whether a game is "built yet" is read from that marker after the
 * client decrypts, not from a status field; visibility to kids is `isActive`.
 * Updating a game is `PATCH /api/games/:id`.
 *
 * Caps are sized for ciphertext (an enc:v1: record costs ~43 + 1.34n chars) and
 * are DoS guards only — the server cannot see the plaintext it is bounding.
 */
const CreateGameSchema = z.object({
  kidId: z.string().uuid(),
  /** Remix lineage: the published Discover game this was copied from. */
  sourceGameId: z.string().uuid().optional(),
  codeBundle: z.string().min(1).max(1_000_000),
  title: z.string().trim().min(1).max(2_000),
  description: z.string().max(20_000).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
  markdown: z.string().max(400_000).optional(),
  learningGoal: z.string().max(10_000).optional(),
  successDefinition: z.string().max(10_000).optional(),
  successCriteria: z
    .union([z.string().max(50_000), z.record(z.string(), z.unknown())])
    .optional(),
  progressKind: z.enum(["goal", "open"]).optional(),
  previewImage: z.string().max(2_000_000).optional(),
  targetAgeMin: z.number().int().min(1).max(25).optional(),
  targetAgeMax: z.number().int().min(1).max(25).optional(),
  estimatedDurationMinutes: z.number().int().min(1).max(180).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
  // enc:v1: sealed studio conversation transcript (server stays blind).
  agentTranscriptEnc: z.string().optional(),
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
  // No `search` param: title/description are ciphertext here. Free-text search
  // is a client-side filter over the decrypted library (see game-library.tsx).
  const includeSystem = searchParams.get("includeSystem") !== "false";
  const tags = searchParams.getAll("tag").filter(Boolean);

  // Parent studio view: all custom games for the account, each annotated with
  // its sharing state and play/copy counts. Canonical titles (no per-kid
  // translation). Stats reuse the Discover aggregate (service-role): plays on
  // this row, copies = private remixes pointing back via source_game_id.
  if (scope === "account") {
    try {
      const [games, sharingByGame] = await Promise.all([
        listAccountGames(supabase, accountId),
        getAccountSharingByGame(supabase, accountId),
      ]);
      const statsByGame = await getGameStats(
        serviceClient(),
        games.map((game) => game.id),
      );
      const withSharing = games.map((game) => {
        const stats = statsByGame.get(game.id);
        return {
          ...game,
          sharing: sharingByGame[game.id] ?? { family: false, kidIds: [] },
          plays: stats?.plays ?? 0,
          copies: stats?.copies ?? 0,
        };
      });
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
    // The service client lets the kid library include published Discover rows
    // this family shared (they belong to other accounts, hidden by RLS).
    const games = await listGames(
      supabase,
      { kidId, includeSystem, tags, accountId },
      kidId ? serviceClient() : undefined,
    );

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

    // Every content field below is opaque here. "Built yet?", "is this a goal
    // game?" and "should kids see it?" are all decided by the client, which is
    // the only side that can read the bundle's placeholder marker and the
    // success definition — hence the conservative defaults (inactive, open).
    const created = await createCustomGame(supabase, {
      accountId: accountId,
      kidId,
      sourceGameId: data.sourceGameId,
      title: data.title,
      description: data.description,
      tags: data.tags,
      markdown: data.markdown,
      codeBundle: data.codeBundle,
      metadata: data.metadata as GameMetadata | undefined,
      targetAgeMin: data.targetAgeMin,
      targetAgeMax: data.targetAgeMax,
      estimatedDurationMinutes: data.estimatedDurationMinutes,
      learningGoal: data.learningGoal ?? "",
      successDefinition: data.successDefinition ?? "",
      successCriteria: data.successCriteria as SuccessCriteria | undefined,
      progressKind: data.progressKind ?? "open",
      previewImage: data.previewImage,
      agentTranscriptEnc: data.agentTranscriptEnc,
      createdBy: "parent",
      isActive: data.isActive ?? false,
    });

    if (data.audience) {
      await replaceGameSharings(supabase, created.id, accountId, {
        family: data.audience.isFamily,
        kidIds: data.audience.audienceIds,
      });
    }

    log.info("game_created", { kidId, gameId: created.id });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message = describeError(error);
    log.error("creation_failed", { kidId, error: message });
    logServerError("api/games#POST", error, { accountId, httpStatus: 500 });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
