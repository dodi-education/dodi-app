import { NextResponse } from "next/server";

import { serverErrorResponse } from "@/lib/error-logs";
import { serviceDb } from "@/lib/db";
import { getLocalizedPlans } from "@/services/plans";

/**
 * Public: the subscribable plan catalogue, localized by `?locale=` (default en).
 * platform_plans/translations are world-readable; the service db serves them.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") ?? "en";
  try {
    const plans = await getLocalizedPlans(serviceDb, locale);
    return NextResponse.json({ plans });
  } catch (error) {
    return serverErrorResponse(error, "Failed to load plans", "api/plans#GET");
  }
}
