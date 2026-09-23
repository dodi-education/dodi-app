# @dodi/screenshot

A small headless-browser worker that turns a game document into real
screenshots, so the game-building agent can look at what it made.

## Why it exists

The game agent runs in the parent's browser. Browser JavaScript cannot
rasterize its own rendered output (that is a web security boundary, not an
iframe rule), so a real screenshot needs a renderer outside the page. This
worker is that renderer. The platform proxies to it at
`POST /api/games/screenshot` for accounts that chose **Use dodi screenshot
service** in Settings, Game Studio. Parents who would rather not send game
code to dodi can run this exact image themselves and pick **Use custom
screenshot service** with its URL instead.

## What it promises

- **Transient.** A request is rendered, screenshotted, answered, and forgotten.
  Nothing is written to disk. The per-request log line carries method, status,
  timing, document size, frame count and readiness. Never the document.
- **Isolated.** Every request gets a fresh, offline browser context; the game
  loads into a `sandbox="allow-scripts"` iframe exactly like the app's sandbox;
  every network request is aborted on top of the document's own CSP.
- **Bounded.** Body cap, viewport range, step count and per-render deadline are
  fixed by the contract (`@dodi/games/screenshot-contract`). Beyond the
  concurrency limit and a short queue, it answers 429 instead of piling up.

## Contract (v1)

`POST /render` with `content-type: application/json`:

```jsonc
{
  "version": 1,
  "document": "<!doctype html>…",          // the full sandbox srcdoc, ≤ 1.5 MB
  "viewport": { "width": 576, "height": 720 }, // optional, default 576×720 (4:5)
  "locale": "de",                            // optional, delivered in dodi:init
  "settleMs": 600,                           // optional pause after game:ready
  "steps": [                                 // optional, ≤ 4; a frame follows each
    { "label": "after first answer",
      "command": { "type": "submit_answer", "payload": { "answer": "3" } },
      "waitMs": 500 }
  ]
}
```

Reply `200`:

```jsonc
{
  "version": 1,
  "frames": [ { "label": "initial", "image": "data:image/jpeg;base64,…" }, … ],
  "ready": true,        // game:ready arrived; false = the game crashed on init
  "warnings": [ "step 1 (after first answer): no game:result within 500ms" ],
  "errors": [ "TypeError: …" ],  // uncaught exceptions + console.error, capped
  "layoutIssues": [              // optional, ≤ 8: measured UI collisions
    "div.clock \"12\" covers div.progress (284×14 px at 160,120), frame 1 (initial)"
  ]
}
```

`layoutIssues` comes from measuring the game's DOM after every frame
(`src/layout-probe.ts`): visible UI elements (controls, media, text, boxed
elements) that cover or cut into each other. Page-sized layers, ancestor and
descendant pairs, pointer-transparent decoration, and a small element layered
fully on top of a bigger one are ignored; a game marks an intended overlap
with `data-overlap-ok`. A service that does not measure simply omits the field.

Errors: `400` invalid body, `401` bad secret, `413` too large, `429` busy,
`504` render timeout. `GET /healthz` answers `{ "ok": true }`.

The Zod schemas for both shapes live in
`core/games/src/screenshot-contract.ts` and are what every party validates
with, including the app when it talks to a custom service.

## Running it

Locally (Chromium's headless shell is downloaded once, ~100 MB):

```bash
cp screenshot/.env.local.example screenshot/.env.local   # set the shared secret
pnpm --filter @dodi/screenshot browsers
pnpm --filter @dodi/screenshot dev          # http://localhost:3006
```

`dev` reads `screenshot/.env.local`. Point the platform at the worker with
`SCREENSHOT_SERVICE_URL=http://localhost:3006` and the same
`SCREENSHOT_SERVICE_SECRET` in `platform/.env.local`, then restart the platform.

The headless shell needs Chromium's system libraries. If a render answers
`500` and the log says `error while loading shared libraries`, install them
once (needs sudo; calls the CLI through node because corepack's pnpm is not
in root's cache):

```bash
sudo node screenshot/node_modules/playwright/cli.js install-deps chromium-headless-shell   # from the dodi-app root
```

Or run the Docker image below, which ships them. Its Dockerfile uses
`RUN --mount`, so the build needs BuildKit (the `docker-buildx` plugin).

Self-hosting the worker for the app's **custom screenshot service** mode:

```bash
docker build -f screenshot/Dockerfile -t dodi/screenshot .   # from the dodi-app root
docker run -d --name dodi-screenshot -p 3006:3006 \
  -e ALLOWED_ORIGINS=https://app.dodi.app \
  dodi/screenshot
```

Put it behind TLS (the app is served over HTTPS, so a custom URL must be
`https://…`, or `http://localhost` for local testing) and enter
`https://your-host/render` in Settings, Game Studio. `ALLOWED_ORIGINS` is the
CORS allowlist for browsers calling `/render` directly; the platform's
server-to-server calls need no CORS.

## Environment

| Variable                   | Default | Meaning                                                             |
|----------------------------|---------|---------------------------------------------------------------------|
| `PORT`                     | `3006`  | Listen port                                                         |
| `SCREENSHOT_SERVICE_SECRET`| unset   | When set, `/render` requires it in `x-screenshot-secret`            |
| `ALLOWED_ORIGINS`          | unset   | Comma list of browser origins granted CORS on `/render`             |
| `MAX_CONCURRENT_RENDERS`   | `2`     | Renders in flight; the queue holds twice that, then `429`           |
| `RENDER_TIMEOUT_MS`        | `20000` | Hard deadline per render                                            |
| `READY_TIMEOUT_MS`         | `5000`  | How long a game gets to answer `dodi:init`                          |
| `CHROMIUM_SANDBOX`         | `0`     | `1` to keep Chromium's own sandbox (needs user namespaces in Docker)|

Chromium's process sandbox is off by default because most container runtimes
do not provide user namespaces; the container and the offline, sandboxed
iframe are the isolation boundary. Set `CHROMIUM_SANDBOX=1` where the host
allows it.
