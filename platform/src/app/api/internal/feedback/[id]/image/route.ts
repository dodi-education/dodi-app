import { NextResponse } from "next/server";

import { UUID } from "@/lib/asset-publication-api";
import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { isInternalAuthorized } from "@/lib/internal-auth";
import { getOpsFeedbackImage } from "@/services/feedback-messages";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * The image attached to one feedback message, as its raw bytes, for the ops
 * console (which serves it on to the signed-in staff browser). The type was
 * detected from the bytes when the parent sent it, and the response is locked
 * down anyway: no sniffing, no scripts, never cached. Ops m2m only.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  if (!isInternalAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await context.params;
  if (!UUID.safeParse(id).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const image = await getOpsFeedbackImage(serviceDb, id);
    if (!image) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return new Response(image.bytes as BodyInit, {
      headers: {
        "content-type": image.contentType,
        "content-length": String(image.bytes.byteLength),
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
        "content-security-policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to load feedback image",
      "api/internal/feedback/[id]/image#GET",
      {},
    );
  }
}
