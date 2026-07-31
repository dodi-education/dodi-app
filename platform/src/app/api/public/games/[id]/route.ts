import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceClient } from "@/lib/supabase";
import { getPublishedGameDetail } from "@/services/discover";
import { applyTranslation, getTranslation } from "@/services/game-translations";

/**
 * Public (no-auth) detail of one LIVE published game — the logged-out game
 * page's data source. Only rows with published_at set are served, which by the
 * E2EE invariant are plaintext; the discover projection keeps publisher ids
 * out. The 404 is uniform across nonexistent, unpublished and malformed ids so
 * the endpoint cannot be used to probe which private games exist.
 */
export const dynamic = "force-dynamic";

const QuerySchema = z.object({
  /** Viewer locale — localizes the system games (the only translated rows). */
  locale: z.string().min(2).max(5).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Game not found" }, { status: 404 });
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  // Reject malformed ids before they reach PostgREST (a uuid cast error would
  // surface as a 500 and distinguish them from the uniform 404).
  if (!z.string().uuid().safeParse(id).success) return notFoundResponse();

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
    const service = serviceClient();
    const game = await getPublishedGameDetail(service, id);
    if (!game) return notFoundResponse();
    const translation = await getTranslation(
      service,
      id,
      parsed.data.locale ?? "en",
    );
    return NextResponse.json(applyTranslation(game, translation));
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch public game",
      "api/public/games/[id]#GET",
    );
  }
}
