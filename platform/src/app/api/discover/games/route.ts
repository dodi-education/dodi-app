import { NextResponse } from "next/server";
import { z } from "zod/v4";

import type { DiscoverGameSummary } from "@dodi/types/games";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import {
  DISCOVER_MAX_PAGE_SIZE,
  getGameStats,
  listPublishedGames,
} from "@/services/discover";
import {
  applyTranslation,
  getTranslationsForGames,
} from "@/services/game-translations";

/**
 * The dodi Discover catalog: published games, newest first, keyset-paginated.
 * Rows come from the service client behind an explicit projection (publisher
 * ids never leak — see services/discover); the caller's OWN sharing state is
 * attached per row through their RLS client so the UI can show "Added".
 */
const QuerySchema = z.object({
  cursor: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(DISCOVER_MAX_PAGE_SIZE).optional(),
  /** Viewer locale — localizes the system games (the only translated rows). */
  locale: z.string().min(2).max(5).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    locale: searchParams.get("locale") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const service = serviceClient();
    const rows = await listPublishedGames(service, parsed.data);
    const gameIds = rows.map((row) => row.id);

    // The caller's own sharing state for the page's games ("Added" markers).
    const sharingByGame = new Map<string, { family: boolean; kidIds: string[] }>();
    if (rows.length > 0) {
      const { data: sharings, error } = await supabase
        .from("game_sharings")
        .select("game_id, kid_id")
        .eq("account_id", accountId)
        .in("game_id", gameIds);
      if (error) throw error;
      for (const row of sharings ?? []) {
        let entry = sharingByGame.get(row.game_id);
        if (!entry) {
          entry = { family: false, kidIds: [] };
          sharingByGame.set(row.game_id, entry);
        }
        if (row.kid_id === null) entry.family = true;
        else entry.kidIds.push(row.kid_id);
      }
    }

    // Cross-family play & copy counts for the page (service-role aggregate).
    const statsByGame = await getGameStats(service, gameIds);

    // Per-locale title/description overrides: system games (seeded) and parent
    // publications (written by the publish gate) both carry them.
    const translations = await getTranslationsForGames(
      supabase,
      gameIds,
      parsed.data.locale ?? "en",
    );

    const games: DiscoverGameSummary[] = rows.map((row) => {
      const stats = statsByGame.get(row.id);
      return {
        ...applyTranslation(row, translations.get(row.id)),
        plays: stats?.plays ?? 0,
        copies: stats?.copies ?? 0,
        sharing: sharingByGame.get(row.id) ?? { family: false, kidIds: [] },
      };
    });

    const limit = parsed.data.limit ?? 24;
    const nextCursor =
      rows.length === limit ? rows[rows.length - 1].published_at : null;

    return NextResponse.json({ games, nextCursor });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list published games",
      "api/discover/games#GET",
      { accountId },
    );
  }
}
