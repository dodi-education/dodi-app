import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { canonicalRedirectHost } from "@/lib/canonical-host";

const KID_ROUTE_PREFIXES = ["/home", "/games", "/snapshots", "/friends"];

/** Kid-app routes (and their subroutes) that need an active kid resolved. */
function isKidRoute(pathname: string): boolean {
  return KID_ROUTE_PREFIXES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
}

/**
 * Resolve the account's first (oldest) kid and the cookies that make it active:
 * `dodi-active-kid`, its plaintext `language` as `dodi-kid-locale`, and
 * `dodi-view=kid` so the server renders the kid's UI locale. Returns null when
 * the account has no kids. `avatar_pin` is E2EE, so the server can only pick the
 * kid — PIN gating stays client-side (see the kid layout).
 */
async function firstKidCookies(
  supabase: ReturnType<typeof createServerClient>,
): Promise<Array<{ name: string; value: string }> | null> {
  const { data } = await supabase
    .from("kids")
    .select("id, language")
    .order("created_at", { ascending: true })
    .limit(1);
  const kid = data?.[0] as { id: string; language: string | null } | undefined;
  if (!kid) return null;
  return [
    { name: "dodi-active-kid", value: kid.id },
    { name: "dodi-kid-locale", value: kid.language ?? "en" },
    { name: "dodi-view", value: "kid" },
  ];
}

/** Copy any refreshed auth cookies onto a redirect, then set the kid cookies. */
function primeRedirect(
  redirect: NextResponse,
  source: NextResponse,
  kidCookies: Array<{ name: string; value: string }>,
): NextResponse {
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  for (const c of kidCookies) {
    redirect.cookies.set(c.name, c.value, { path: "/", maxAge: 86400 });
  }
  return redirect;
}

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  // App-logic routes must run on the canonical app host (app.dodi.app) so the
  // browser Origin matches the platform API's CORS allowlist; dev (LAN IP/
  // localhost) and preview hosts are left alone. Done first so redirects skip the
  // session refresh below and don't first bounce to /login on the wrong host.
  const redirectHost = canonicalRedirectHost(
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

  // Public routes that don't require auth
  const publicRoutes = ["/", "/login", "/register", "/reset-password"];
  // A single game page is public — the SEO inbound channel. Only published
  // games render there (the server page redirects everything else to /login);
  // the /games library and all other kid routes stay gated.
  const isPublicGamePage = /^\/games\/[^/]+$/.test(pathname);
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    isPublicGamePage;

  // Redirect unauthenticated users from protected routes to login, carrying
  // the target so a successful login can return to it (deep links).
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // The marketing site is a separate deployment; this app has no landing page,
  // so the root always routes into the app: signed-in users to /home, everyone
  // else (including direct/localhost access) to /login. For a signed-in user we
  // also prime the active kid + locale so /home renders the right kid in the
  // right language instead of "No kid selected".
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/home" : "/login";
    const redirect = NextResponse.redirect(url);
    const kidCookies =
      user && !request.cookies.get("dodi-active-kid")?.value
        ? await firstKidCookies(supabase)
        : null;
    return primeRedirect(redirect, supabaseResponse, kidCookies ?? []);
  }

  // Cold entry to a kid route with no active kid yet: resolve the first kid +
  // locale server-side and prime the cookies via a one-time same-URL redirect,
  // so the first render already shows the right kid in the right language — the
  // same result as the parent→kid switch, now also from "/" and direct links.
  // Once the cookie is set this is skipped, so there is no redirect loop.
  if (
    user &&
    isKidRoute(pathname) &&
    !request.cookies.get("dodi-active-kid")?.value
  ) {
    const kidCookies = await firstKidCookies(supabase);
    if (kidCookies) {
      const redirect = NextResponse.redirect(request.nextUrl.clone());
      return primeRedirect(redirect, supabaseResponse, kidCookies);
    }
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

  // Forward the resolved auth state to server components — the (kid) layout
  // and the game page branch between the kid and the public experience on it.
  // Rebuilt AFTER getUser() so the forwarded request carries any refreshed
  // auth cookies too; the refreshed Set-Cookies are copied from the response
  // Supabase populated above (same nuance as primeRedirect).
  const finalHeaders = forwardedHeaders();
  finalHeaders.set("x-dodi-authed", user ? "1" : "0");
  const response = NextResponse.next({ request: { headers: finalHeaders } });
  supabaseResponse.cookies
    .getAll()
    .forEach((cookie) => response.cookies.set(cookie));
  if (!user) {
    // Response marker for the service worker: an anonymous render must never
    // be cached as the offline kid shell (see public/sw.js).
    response.headers.set("x-dodi-anon", "1");
  }
  return response;
}
