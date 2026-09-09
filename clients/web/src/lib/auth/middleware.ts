import { type NextRequest, NextResponse } from "next/server";

import { canonicalRedirectHost } from "@/lib/canonical-host";
import { locales } from "@/i18n/config";

/**
 * Name of the first-party cookie mirroring the bearer token (set client-side by
 * lib/auth/client.ts). Duplicated here rather than imported: this module runs
 * in the edge middleware and must not pull the browser auth client in.
 */
const SESSION_COOKIE_NAME = "dodi-session";

const KID_ROUTE_PREFIXES = ["/home", "/games", "/snapshots", "/friends"];

/** Kid-app routes (and their subroutes) that need an active kid resolved. */
function isKidRoute(pathname: string): boolean {
  return KID_ROUTE_PREFIXES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
}

/**
 * Platform API origin for server-side calls. `API_URL_INTERNAL` lets a
 * container reach the platform over the internal network; otherwise the public
 * origin the browser also uses.
 */
function apiBaseUrl(): string {
  const base = process.env.API_URL_INTERNAL || process.env.NEXT_PUBLIC_API_URL;
  if (!base) throw new Error("NEXT_PUBLIC_API_URL is not set");
  return base;
}

interface SessionUser {
  id: string;
  email: string;
}

type SessionLookup =
  | { user: SessionUser; isStale: false }
  | { user: null; isStale: boolean };

/**
 * Validate the bearer from the cookie mirror against the platform. A definitive
 * "no session" (JSON `null`, 401/403) marks the cookie stale so the response can
 * drop it; a transport failure or 5xx is treated as anonymous for this request
 * only, leaving the cookie for the next one.
 */
async function lookupSession(token: string): Promise<SessionLookup> {
  try {
    const res = await fetch(`${apiBaseUrl()}/api/auth/get-session`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) {
      return { user: null, isStale: true };
    }
    if (!res.ok) return { user: null, isStale: false };
    const body = (await res.json()) as {
      user?: { id?: unknown; email?: unknown } | null;
    } | null;
    const user = body?.user;
    if (user && typeof user.id === "string") {
      return {
        user: { id: user.id, email: typeof user.email === "string" ? user.email : "" },
        isStale: false,
      };
    }
    return { user: null, isStale: true };
  } catch {
    return { user: null, isStale: false };
  }
}

/**
 * Resolve the account's first (oldest) kid and the cookies that make it active:
 * `dodi-active-kid`, its plaintext `language` as `dodi-kid-locale`, and
 * `dodi-view=kid` so the server renders the kid's UI locale. Returns null when
 * the account has no kids (or the lookup fails). `avatar_pin` is E2EE, so the
 * server can only pick the kid — PIN gating stays client-side (see the kid
 * layout). The platform lists kids oldest first.
 */
async function firstKidCookies(
  token: string,
): Promise<Array<{ name: string; value: string }> | null> {
  let kid: { id: string; language: string | null } | undefined;
  try {
    const res = await fetch(`${apiBaseUrl()}/api/kids`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const kids = (await res.json()) as Array<{
      id: string;
      language?: string | null;
    }>;
    const first = Array.isArray(kids) ? kids[0] : undefined;
    if (first) kid = { id: first.id, language: first.language ?? null };
  } catch {
    return null;
  }
  if (!kid) return null;
  return [
    { name: "dodi-active-kid", value: kid.id },
    { name: "dodi-kid-locale", value: kid.language ?? "en" },
    { name: "dodi-view", value: "kid" },
  ];
}

/** Set the kid cookies on a redirect. */
function primeRedirect(
  redirect: NextResponse,
  kidCookies: Array<{ name: string; value: string }>,
): NextResponse {
  for (const c of kidCookies) {
    redirect.cookies.set(c.name, c.value, { path: "/", maxAge: 86400 });
  }
  return redirect;
}

/** Drop a session cookie the platform no longer recognizes. */
function clearStaleSession(response: NextResponse, isStale: boolean): NextResponse {
  if (isStale) response.cookies.delete({ name: SESSION_COOKIE_NAME, path: "/" });
  return response;
}

export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  // App-logic routes must run on the canonical app host (app.dodi.app) so the
  // browser Origin matches the platform API's CORS allowlist; dev (LAN IP/
  // localhost) and preview hosts are left alone. Done first so redirects skip the
  // session lookup below and don't first bounce to /login on the wrong host.
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
  // parent routes from kid routes — see resolve-locale.ts.
  const forwardedHeaders = () => {
    const headers = new Headers(request.headers);
    headers.set("x-pathname", request.nextUrl.pathname);
    return headers;
  };

  const { pathname } = request.nextUrl;

  // Public routes that don't require auth
  const publicRoutes = ["/", "/login", "/register", "/reset-password"];
  // A single game page is public — the SEO inbound channel — both unprefixed
  // (/games/[id], language-negotiated) and locale-prefixed (/{locale}/games/
  // [id], the crawlable per-language variants). Only published games render
  // there (the server page redirects everything else to /login); the /games
  // library and all other kid routes stay gated.
  const isPublicGamePage = new RegExp(
    `^/(?:(?:${locales.join("|")})/)?games/[^/]+$`,
  ).test(pathname);
  const isPublicRoute =
    publicRoutes.includes(pathname) ||
    pathname.startsWith("/auth/") ||
    isPublicGamePage;

  // The auth state comes from the bearer mirrored into the `dodi-session`
  // cookie, validated against the platform. Public routes still resolve it when
  // a cookie is present (the reverse guard and the public game page's signed-in
  // branch need it); without a cookie there is nothing to look up.
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? "";
  const lookup: SessionLookup = token
    ? await lookupSession(token)
    : { user: null, isStale: false };
  const { user } = lookup;

  // Redirect unauthenticated users from protected routes to login, carrying
  // the target so a successful login can return to it (deep links).
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return clearStaleSession(NextResponse.redirect(url), lookup.isStale);
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
        ? await firstKidCookies(token)
        : null;
    return clearStaleSession(
      primeRedirect(redirect, kidCookies ?? []),
      lookup.isStale,
    );
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
    const kidCookies = await firstKidCookies(token);
    if (kidCookies) {
      const redirect = NextResponse.redirect(request.nextUrl.clone());
      return primeRedirect(redirect, kidCookies);
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
  const finalHeaders = forwardedHeaders();
  finalHeaders.set("x-dodi-authed", user ? "1" : "0");
  const response = NextResponse.next({ request: { headers: finalHeaders } });
  if (!user) {
    // Response marker for the service worker: an anonymous render must never
    // be cached as the offline kid shell (see public/sw.js).
    response.headers.set("x-dodi-anon", "1");
  }
  return clearStaleSession(response, lookup.isStale);
}
