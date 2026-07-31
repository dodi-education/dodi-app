# Offline PWA — Kid View

Kids can open dodi offline and play their available games collection. Only the
KID view (`/home`, `/games`, `/snapshots`, `/friends`) is offline-capable; the
parent view, Friends, Discover, and the dodi voice companion are online-only
and degrade gracefully.

## Architecture (three independent layers)

**1. App shell — service worker (`clients/web/public/sw.js`)**
Hand-rolled (no serwist/workbox: Next 16 builds with Turbopack, and everything
offline-critical is authed E2EE data no precache manifest could cover).
Navigations to kid routes are network-first with an HTML-shell cache fallback;
`/_next/static`, `/_next/image` and public assets are cache-first. Detail
pages are additionally cached under a synthetic `__detail-shell` key: the
detail pages derive their entity id from `location.pathname` (not the hydrated
route params) and render nothing until data resolves, so ONE cached shell
serves every `/games/<id>` offline. RSC flight fetches (`?_rsc=`) are never
intercepted — offline navigations become full-page loads (connectivity-aware
links in the kid nav/cards force this; `OfflineAwareLink`). Registered in
production or with `NEXT_PUBLIC_ENABLE_SW=1` (`register-service-worker.tsx`).
Manifest/icons: `src/app/manifest.ts`, `public/icons/` (regenerate via
`scripts/generate-pwa-icons.mjs`). **Bump `CACHE_VERSION` in sw.js when the
caching logic or precache list changes.**

**2. Data — IndexedDB ciphertext cache (`clients/web/src/lib/offline/offline-cache.ts`)**
Stores exactly what the platform returned — `enc:v1:` ciphertext rows (games
incl. `code_bundle`, kids, snapshot lists/payloads) — never decrypted
plaintext. The wrapped vault-keys blob is additionally sealed under a
non-extractable AES-GCM key (an IndexedDB dump alone must not yield the VMK;
the device KEM secret already lives in the `dodi-vault` DB). Read-through
seams: `game-store.loadForKid/loadOne`, `kid-store`, `vault-store.
unlockSilently`, `lib/snapshots.ts` — replace-on-successful-fetch, serve-stale
only on network failure (`TypeError`), never on HTTP errors. `needs-setup`
stays online-authoritative. Sign-out wipes the DB. The kid layout requests
`navigator.storage.persist()`.

**3. Tracking — play/event outbox (`clients/web/src/lib/games/play-sync.ts`)**
Play ids are client-generated UUIDs (idempotency keys), so play tracking is
synchronous and survives offline in a localStorage outbox; flushes replay
POST → PATCH with the real timestamps (`startedAt`/`succeededAt`/`endedAt`/
`occurredAt`, server-clamped to now+5min…now−30d). Activities gained
`occurred_at` (migration `20260731120000_activities_occurred_at.sql`) so
late-synced events sort at their gameplay moment. Offline autosaves park in
`pending_autosaves` and flush on reconnect.

## Connectivity signal

`stores/connectivity-store.ts` (+ `hooks/use-online.ts`): browser
online/offline events, corrected by actual fetch outcomes (network failure →
offline, any success → online). Consumers: dodi session guards (`connect`/
`setContext` no-op offline, without `fatalError`, so auto-reconnect fires when
connectivity returns), offline UI (sleep art + "No internet connection." under
dodi on Home, wifi-off badge on the header avatar, friends placeholder,
disabled favorite/delete), `OfflineAwareLink`, and the outbox flush triggers
(`onBackOnline`).

## Manual verification checklist

1. Online: browse `/home` and `/games`, open a game. Then DevTools → offline →
   hard reload: shell loads, vault silently unlocks, library renders, games
   play (sandbox needs no network), dodi sleeps with the offline message.
2. Play a game offline → `dodi-play-outbox` in localStorage → back online →
   `game_plays` row with the offline `started_at`, activity at `occurred_at`.
3. Lighthouse: installability passes; install on iPad, relaunch offline.
