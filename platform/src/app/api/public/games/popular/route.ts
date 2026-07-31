import { NextResponse } from "next/server";
import { z } from "zod/v4";

import type { PublicGameSummary } from "@dodi/types/games";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceClient } from "@/lib/supabase";
import { listRandomPublishedGameSummaries } from "@/services/discover";
import {
  applyTranslation,
  getTranslationsForGames,
} from "@/services/game-translations";

/**
 * Public (no-auth) endpoint for the logged-out game page: a random slice of
 * the published catalog. Rows come from the service client behind the discover
 * projection, so publisher ids never leak. CORS + OPTIONS preflight are
 * handled generically in middleware.ts.
 */
export const dynamic = "force-dynamic";

const PUBLIC_POPULAR_MAX = 10;

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PUBLIC_POPULAR_MAX).optional(),
  /** Viewer locale — localizes the system games (the only translated rows). */
  locale: z.string().min(2).max(5).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
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
    const rows = await listRandomPublishedGameSummaries(
      service,
      parsed.data.limit ?? PUBLIC_POPULAR_MAX,
    );
    const translations = await getTranslationsForGames(
      service,
      rows.map((row) => row.id),
      parsed.data.locale ?? "en",
    );
    const games: PublicGameSummary[] = rows.map((row) =>
      applyTranslation(row, translations.get(row.id)),
    );
    return NextResponse.json({ games });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list popular games",
      "api/public/games/popular#GET",
    );
  }
}
