import { NextResponse } from "next/server";

import { anonClient } from "@/lib/supabase";
import { getLocalizedPlans } from "@/services/plans";

/**
 * Public: the subscribable plan catalogue, localized by `?locale=` (default en).
 * platform_plans/translations are world-readable, so the anon client suffices.
 */
export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") ?? "en";
  try {
    const plans = await getLocalizedPlans(anonClient(), locale);
    return NextResponse.json({ plans });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load plans";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
