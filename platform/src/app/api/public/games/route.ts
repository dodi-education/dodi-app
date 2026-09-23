import { NextResponse } from "next/server";
import { z } from "zod/v4";

import type { PublicCatalogGame } from "@dodi/types/games";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceDb } from "@/lib/db";
import { listPublishedGameCatalog } from "@/services/discover";
import {
  applyTranslation,
  getTranslationsForGames,
} from "@/services/game-translations";

/**
 * Public (no-auth) full catalog: every LIVE published game as a localized
 * summary plus `updated_at` (the discover projection, so publisher ids never
 * leak). One shape for every consumer, each taking what it needs: the web
 * client's /sitemap.xml (ids + timestamps) and the marketing site's statically
 * built games page (dodi-com/landing).
 */
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  /** Viewer locale — localizes the translated rows. */
  locale: z.string().min(2).max(5).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    locale: searchParams.get("locale") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const rows = await listPublishedGameCatalog(serviceDb);
    const translations = await getTranslationsForGames(
      serviceDb,
      rows.map((row) => row.id),
      parsed.data.locale ?? "en",
    );
    const games: PublicCatalogGame[] = rows.map((row) =>
      applyTranslation(row, translations.get(row.id)),
    );
    return NextResponse.json({ games });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list published games",
      "api/public/games#GET",
    );
  }
}
