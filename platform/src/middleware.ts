import { type NextRequest, NextResponse } from "next/server";

import { isInternalAuthorized } from "@/lib/internal-auth";

/**
 * CORS for the api.dodi.app API. Clients (dodi.app, native apps, the agent)
 * authenticate with a bearer token — no cookies — so we allow the
 * `Authorization` header from an allow-list of origins. The allow-list is
 * env-driven (CORS_ALLOWED_ORIGINS, comma-separated); defaults to local dev.
 *
 * `/api/internal/**` is the ops↔platform m2m surface: the whole subtree is
 * gated here (see lib/internal-auth), so a newly added internal route is
 * protected before it writes a line of auth. Routes re-check as defense in
 * depth. Browsers never call these endpoints — no CORS grant for them.
 */
const ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000"
)
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Headers {
  const headers = new Headers();
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set("access-control-allow-origin", origin);
  }
  headers.set("access-control-allow-methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "authorization,content-type");
  headers.set("access-control-max-age", "86400");
  headers.set("vary", "Origin");
  return headers;
}

export function middleware(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/internal")) {
    if (!isInternalAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  const origin = request.headers.get("origin");
  const headers = corsHeaders(origin);

  if (request.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const response = NextResponse.next();
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export const config = { matcher: "/api/:path*" };
