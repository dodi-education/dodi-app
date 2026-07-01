import { NextResponse } from "next/server";

import { getRegistrationMode } from "@/services/registration";

/**
 * Public: the current registration mode (open | invite | closed). The client
 * uses this to render the register page (closed message / invite field / open).
 * Enforcement is the before_user_created hook, not this endpoint.
 */
export async function GET(): Promise<Response> {
  return NextResponse.json({ mode: getRegistrationMode() });
}
