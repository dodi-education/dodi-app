import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceClient } from "@/lib/supabase";
import { listPublishedSitemapEntries } from "@/services/discover";

/**
 * Public (no-auth) sitemap feed: id + timestamps of every LIVE published game.
 * Consumed by the web client's /sitemap.xml so search engines can discover the
 * public game pages. No content fields — crawlers fetch the pages themselves.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    const games = await listPublishedSitemapEntries(serviceClient());
    return NextResponse.json({ games });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list published games for the sitemap",
      "api/public/games#GET",
    );
  }
}
