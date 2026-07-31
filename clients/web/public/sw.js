/*
 * dodi service worker — offline shell for the KID view.
 *
 * Scope of responsibility (deliberately narrow):
 *  - Navigations to kid routes (/home, /games, /snapshots, /friends) are
 *    network-first and cached as HTML shells for offline reloads. Detail pages
 *    are additionally stored under a synthetic "__detail-shell" key: the detail
 *    pages derive their entity id from location.pathname on the client, so one
 *    cached shell serves every /games/<id> (resp. /snapshots/<id>) URL offline.
 *  - Hashed build assets (/_next/static), the Next image optimizer
 *    (/_next/image), and public assets are cache-first (content-hashed or
 *    immutable-in-practice).
 *  - Everything else — the cross-origin platform API, RSC flight fetches
 *    (?_rsc=), POSTs — is never intercepted. Offline DATA comes from the
 *    IndexedDB layer inside the app, not from this worker (responses are
 *    authed + E2EE; caching them here would be wrong twice over).
 *
 * Bump CACHE_VERSION when the caching logic or precache list changes; activate
 * drops every cache not in EXPECTED_CACHES.
 */

const CACHE_VERSION = "v1";
const STATIC_CACHE = `dodi-static-${CACHE_VERSION}`;
const PAGES_CACHE = `dodi-pages-${CACHE_VERSION}`;
const EXPECTED_CACHES = [STATIC_CACHE, PAGES_CACHE];

// Shell art so an offline /home always renders something friendly, even if the
// runtime cache never saw these (raw paths; next/image variants fill at runtime).
const PRECACHE_URLS = [
  "/images/dodi-sleep.png",
  "/images/dodi-head-sleep.png",
  "/images/dodi-head-active.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
];

const KID_SECTIONS = ["/home", "/games", "/snapshots", "/friends"];
const DETAIL_SHELL_SECTIONS = ["/games", "/snapshots"];

const STATIC_PREFIXES = [
  "/_next/static/",
  "/_next/image",
  "/images/",
  "/icons/",
  "/sounds/",
  "/audio-worklet-processor.js",
];

const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>dodi</title>
<style>body{font-family:system-ui,sans-serif;background:#F5F8FB;color:#1c314d;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;text-align:center}p{font-size:1.1rem;font-weight:600}</style>
</head><body><div><p>No internet connection.</p><p lang="de">Keine Internetverbindung.</p></div></body></html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      // Best-effort: a missing art file must not brick installation.
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => !EXPECTED_CACHES.includes(name))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function kidSection(pathname) {
  return KID_SECTIONS.find(
    (section) => pathname === section || pathname.startsWith(`${section}/`),
  );
}

// "/games/<id>" (exactly one extra segment) — the shape the universal detail
// shell covers. Deeper paths don't exist in the kid view today.
function detailShellKey(pathname) {
  const section = DETAIL_SHELL_SECTIONS.find(
    (s) => pathname.startsWith(`${s}/`) && pathname !== `${s}/`,
  );
  if (!section) return null;
  const rest = pathname.slice(section.length + 1);
  if (!rest || rest.includes("/")) return null;
  return `${section}/__detail-shell`;
}

function isCacheableShell(response) {
  if (!response || !response.ok || response.redirected) return false;
  const type = response.headers.get("content-type") ?? "";
  return type.includes("text/html");
}

async function handleNavigation(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  const section = kidSection(pathname);

  try {
    const response = await fetch(request);
    if (section && isCacheableShell(response)) {
      const cache = await caches.open(PAGES_CACHE);
      const shellKey = detailShellKey(pathname);
      // Keyed by pathname (not full URL) so query strings don't fragment the cache.
      await cache.put(pathname, response.clone());
      if (shellKey) await cache.put(shellKey, response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    // Root redirects to /home online; mirror that offline.
    const effectiveSection = section ?? (pathname === "/" ? "/home" : null);
    if (effectiveSection) {
      const shellKey = detailShellKey(pathname);
      const fallbacks = [
        pathname,
        ...(shellKey ? [shellKey] : []),
        effectiveSection,
        "/home",
      ];
      for (const key of fallbacks) {
        const cached = await cache.match(key);
        if (cached) return cached;
      }
    }
    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  // Full-URL match: /_next/image variants differ by query string on purpose.
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // RSC flight fetches are never cached — offline soft navigation falls back
  // to a full-page load served from the pages cache instead.
  if (url.searchParams.has("_rsc")) return;

  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(handleStatic(request));
  }
});
