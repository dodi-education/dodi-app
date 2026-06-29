import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { canonicalRedirectHost } from "@/lib/canonical-host";

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  // App-logic routes must run on the canonical app host (app.dodi.app) so the
  // browser Origin matches the platform API's CORS allowlist. Marketing routes
  // stay on apex/www; dev (LAN IP/localhost) and preview hosts are left alone.
  // Done first so redirects skip the session refresh below and don't first bounce
  // to /login on the wrong host.
  const redirectHost = canonicalRedirectHost(
    request.nextUrl.pathname,
    request.headers.get("host"),
    process.env.NEXT_PUBLIC_APP_URL,
  );
  if (redirectHost) {
    const url = request.nextUrl.clone();
    url.hostname = redirectHost;
    url.port = ""; // default port for the scheme on the canonical host
    return NextResponse.redirect(url, 308);
  }

  // Forward the request path so the i18n resolver (src/i18n/request.ts) can tell
  // parent routes from kid routes — see resolve-locale.ts. Built fresh on each
  // response so it also carries any cookies Supabase refreshes below.
  const forwardedHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", request.nextUrl.pathname);
    return headers;
  };

  let supabaseResponse = NextResponse.next({
    request: { headers: forwardedHeaders() },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({
            request: { headers: forwardedHeaders() },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // The marketing landing lives on the apex (dodi.app); the app entrance lives
  // on app.dodi.app. The two share one deployment, so the root path is routed
  // by host.
  const host = request.headers.get("host") ?? "";
  const isAppSubdomain = host.startsWith("app.");

  // Public routes that don't require auth
  const publicRoutes = ["/", "/login", "/register", "/reset-password"];
  const isPublicRoute =
    publicRoutes.includes(pathname) || pathname.startsWith("/auth/");

  // Redirect unauthenticated users from protected routes to login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Root path is host-aware: marketing landing on the apex, app entrance on app.*
  if (pathname === "/") {
    if (user) {
      const url = request.nextUrl.clone();
      url.pathname = "/home";
      return NextResponse.redirect(url);
    }
    if (isAppSubdomain) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    // apex + logged out → fall through and serve the landing page
  }

  if (
    user &&
    (pathname === "/login" ||
      pathname === "/register" ||
      pathname === "/reset-password")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/parent/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
