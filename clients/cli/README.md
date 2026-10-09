# dodi CLI

Let your own AI agent build learning games, companion avatars and accessories
for your family on [dodi](https://app.dodi.app). Works with any agent that can
run shell commands (Claude Code, Cursor, Codex, a local model) or speak MCP.

Everything the agent uploads is sealed on its machine under your family's
vault key. The dodi server never sees your games or your kids' details.

## For parents

Tell your agent:

> Build a learning game for my kid on dodi.app with the dodi CLI (needs Node
> 20+). Install it with `npm install -g @dodi-education/cli`, run `dodi login` and send
> me the link it prints so I can allow access, then read `dodi docs` and
> follow it.

The link opens **Allow access** in the dodi app. Check that the fingerprint
matches what your agent shows, choose what it may do and for how long, and
allow it. **Settings > Access** lists every browser, app,
robot and agent that can open your family's data; revoke any of them there.

Scopes you can grant:

| Scope | Lets the agent |
|---|---|
| `games` | create and edit your family's games |
| `games:publish` | submit games to dodi Discover (reviewed before they go live) |
| `kids:basic` | see your kids' first names and ages |
| `kids:memory` | read a kid's memory dossier (off by default: the agent's AI provider reads it) |
| `assets` | create custom companion avatars and accessories |
| `assets:publish` | share avatars and accessories on dodi Discover |

For an agent that runs unattended, create an **access key** in Settings >
Access and give it to the agent as `DODI_TOKEN` (or `dodi login --token`).

## For agents

```sh
npm install -g @dodi-education/cli
dodi login                       # prints the approval link; exit 3 = still pending
dodi login --resume              # after the parent approved
dodi docs                        # the workflow; `dodi docs games` before writing a game
dodi kids                        # who you build for
dodi games new dino-count        # a working starter game
dodi games check dino-count      # validator + headless run + screenshots
dodi games push dino-count       # seal and upload
dodi games publish dino-count    # optional: dodi Discover
dodi assets new crown --kind accessory
dodi assets check crown && dodi assets push crown
dodi assets publish crown        # optional: share it on dodi Discover
dodi mcp                         # the same commands as an MCP server (stdio)
```

Every command takes `--json`. Exit codes: 0 ok, 1 error, 2 usage, 3 waiting
for approval, 4 check failed, 5 not connected, 6 missing scope.

`dodi games check --local` runs the game in Playwright on your machine
(`npx playwright install chromium`); without it, the dodi screenshot service
renders it.

### MCP

```json
{ "mcpServers": { "dodi": { "command": "dodi", "args": ["mcp"] } } }
```

## Configuration

| Variable | Default | |
|---|---|---|
| `DODI_API_URL` | `https://platform.dodi.app` | a self-hosted platform |
| `DODI_APP_URL` | `https://app.dodi.app` | where approval links point |
| `DODI_CONFIG_DIR` | `~/.config/dodi` | where the device keys live (`credentials.json`, mode 0600) |
| `DODI_TOKEN` | | an access key; wins over the stored login |

## Development

```sh
pnpm --filter @dodi-education/cli dev -- docs     # run from source
pnpm --filter @dodi-education/cli test
pnpm --filter @dodi-education/cli build           # bundles to dist/dodi.js
NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem" pnpm --filter @dodi-education/cli exec tsx scripts/e2e-local.ts
```

`scripts/e2e-local.ts` runs the whole flow (login, approval, kids, games,
assets, scopes, logout) against a local platform on :3001 and its dev
database. `E2E_PUBLISH_GAME=1` adds an access-key agent that publishes the
game to Discover (this sends the operator notification email when the local
platform has one configured).
