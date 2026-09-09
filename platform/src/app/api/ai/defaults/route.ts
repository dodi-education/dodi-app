import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceDb } from "@/lib/db";
import { requireAuth } from "@/lib/resolve-auth";
import { getDodiAIDefaults } from "@/services/dodi-ai";

/**
 * The dodi AI per-category recommendations (platform_config
 * `dodi_ai_defaults`): what the "default" model sentinel resolves to. Authed
 * read via the service db — platform_config itself is default-deny, but
 * this row is non-secret display/config data. Returns null when unseeded
 * (self-host without dodi AI): the client hides/fails dodi AI resolution.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const defaults = await getDodiAIDefaults(serviceDb);
    return NextResponse.json(defaults);
  } catch (error) {
    return serverErrorResponse(error, "Failed to fetch dodi AI defaults", "api/ai/defaults#GET", {
      expose: false,
    });
  }
}
