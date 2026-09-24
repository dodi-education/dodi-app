import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { dataUrlToBytes } from "@dodi/games/export";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceDb } from "@/lib/db";
import { getPublishedGamePreviewImage } from "@/services/discover";

/**
 * Public (no-auth) small preview image of one LIVE published game, as real
 * image bytes. Parent publications store `preview_image` as a data URL, which
 * link-preview scrapers (og:image) reject; this endpoint gives shared links a
 * fetchable URL for it. System games keep serving their same-origin path
 * previews from the web app, so only data URLs are served here. The 404 is
 * uniform across nonexistent, unpublished, malformed and preview-less ids.
 */
export const dynamic = "force-dynamic";

/** Raster only: an SVG served from the API origin would be an XSS surface. */
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: "Preview not found" }, { status: 404 });
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) return notFoundResponse();

  try {
    const preview = await getPublishedGamePreviewImage(serviceDb, id);
    const decoded = preview ? dataUrlToBytes(preview) : null;
    if (!decoded || !ALLOWED_MIME_TYPES.has(decoded.mimeType)) {
      return notFoundResponse();
    }
    return new NextResponse(decoded.bytes as BodyInit, {
      headers: {
        "content-type": decoded.mimeType,
        "content-length": String(decoded.bytes.byteLength),
        // Scrapers re-fetch rarely; an hour keeps a replaced preview fresh-ish.
        "cache-control": "public, max-age=3600",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch public game preview image",
      "api/public/games/[id]/preview-image#GET",
    );
  }
}
