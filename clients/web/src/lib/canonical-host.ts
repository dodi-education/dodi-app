// Host canonicalization for the web app (app.dodi.app). The marketing site is a
// separate deployment, so every route this app serves is app-logic.
//
// App-logic pages call the platform API from the browser, so the page's Origin
// must be the canonical app host — that's the origin the platform's CORS allowlist
// (CORS_ALLOWED_ORIGINS) contains. If such a page were loaded from a non-canonical
// host that shares the app's domain (e.g. apex/www), its Origin wouldn't match and
// the API calls would be blocked. canonicalRedirectHost decides when a request must
// be redirected to the canonical app host so the Origin stays stable. It is pure
// (no NextRequest) so it can be unit-tested directly.

/**
 * The canonical web-app host parsed from NEXT_PUBLIC_APP_URL (e.g. "app.dodi.app"),
 * or null when it is unset or unparseable.
 */
export function getCanonicalAppHost(appUrl: string | undefined): string | null {
  if (!appUrl) return null;
  try {
    return new URL(appUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * True only for request hosts that share the app host's registrable domain
 * (e.g. dodi.app, www.dodi.app → app.dodi.app). This intentionally skips IPs and
 * localhost (the app host has no dot or is numeric) and preview hosts on other
 * domains (e.g. *.vercel.app), so dev and preview deployments are never redirected.
 */
function sharesBaseDomain(reqHost: string, appHost: string): boolean {
  if (!appHost.includes(".") || /^[\d.]+$/.test(appHost)) return false;
  const base = appHost.split(".").slice(-2).join("."); // app.dodi.app → dodi.app
  return reqHost === base || reqHost.endsWith(`.${base}`);
}

/**
 * The host this request should be redirected to so app-logic pages always run on
 * the canonical app host, or null when no redirect is needed (already canonical,
 * no app host configured, or a host outside the app's domain).
 */
export function canonicalRedirectHost(
  reqHostHeader: string | null,
  appUrl: string | undefined,
): string | null {
  const appHost = getCanonicalAppHost(appUrl);
  if (!appHost) return null;

  const reqHost = (reqHostHeader ?? "").split(":")[0].toLowerCase();
  if (!reqHost || reqHost === appHost) return null;
  if (!sharesBaseDomain(reqHost, appHost)) return null;

  return appHost;
}
