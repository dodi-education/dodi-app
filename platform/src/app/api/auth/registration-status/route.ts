import { NextResponse } from "next/server";

import { getRegistrationMode } from "@/services/registration";

// Always evaluate per request against the live env — never statically bake the
// mode at build time or serve a stale cached value. (REGISTRATION_MODE can
// change between deploys.)
export const dynamic = "force-dynamic";

/**
 * Public: the current registration mode (open | invite | closed). The client
 * uses this to render the register page (closed message / invite field / open).
 * Enforcement is the before_user_created hook, not this endpoint.
 */
export async function GET(): Promise<Response> {
  return NextResponse.json(
    { mode: getRegistrationMode() },
    { headers: { "cache-control": "no-store" } },
  );
}
