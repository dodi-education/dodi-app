# dodi CLI

Let your own AI agent make learning games for your family on
[dodi](https://app.dodi.app), the way you would in Game Studio: your agent
describes the game and reviews it, and dodi's own game agent builds it with
your AI providers (background and preview pictures, a visual check and
translations included). Works with any agent that can run shell commands
(Claude Code, Cursor, Codex, a local model) or speak MCP.

Everything the agent uploads is sealed on its machine under your family's
vault key. The dodi server never sees your games or your kids' details.

## For parents

Tell your agent:

> Build a learning game for my kid on dodi.app with the dodi CLI (needs Node
> 20+). Install it with `npm install -g @dodi-education/cli`, run `dodi login`
> and send me the link it prints so I can allow access, then read `dodi docs`
> and follow it: you brief dodi's game agent and review what it builds.

The link opens **Allow access** in the dodi app. Check that the fingerprint
matches what your agent shows, choose what it may do and for how long, and
allow it. **Settings > Access** lists every browser, app,
robot and agent that can open your family's data; revoke any of them there.

Scopes you can grant:

| Scope | Lets the agent |
|---|---|
| `studio` | build with your AI providers: your keys for the game, image and thinking models are handed to the agent's machine (never the voice key), and builds are charged to those accounts |
| `games` | create and edit your family's games |
| `games:publish` | submit games to dodi Discover (reviewed before they go live) |
| `kids:basic` | see your kids' first names and ages |
| `kids:memory` | read a kid's memory and your notes, so games fit (off by default: the agent's AI provider reads them) |
| `assets` | create custom companion avatars and accessories |
| `assets:publish` | share avatars and accessories on dodi Discover |

For an agent that runs unattended, create an **access key** in Settings >
Access and give it to the agent as `DODI_TOKEN` (or `dodi login --token`).

## For agents

```sh
npm install -g @dodi-education/cli
dodi login                         # prints the approval link; exit 3 = still pending
dodi login --resume                # after the parent approved
dodi docs                          # the workflow; `dodi docs studio` before your first brief
dodi kids                          # who you make the game for
dodi studio new "<brief>"          # plan it with dodi
dodi studio plan "<answer>"        # until the plan is right
dodi studio build                  # dodi builds it in the background
dodi studio wait                   # dodi's reply and screenshots to review (exit 3 = still building)
dodi studio send "<feedback>"      # a change round, then wait again
dodi studio settings               # the game's settings; change them only when the parent asks
dodi games publish                 # only when the parent asks: dodi Discover (translated, reviewed)
dodi assets new crown --kind accessory   # custom companion looks (3D, see `dodi docs assets`)
dodi mcp                           # the same commands as an MCP server (stdio)
```

Every command takes `--json`. Exit codes: 0 ok, 1 error, 2 usage, 3 waiting
(approval or a running build), 4 check failed, 5 not connected, 6 missing
scope.

Builds run dodi's own game agent on the agent's machine. Its visual check
renders the game with Playwright when it is installed
(`npx playwright install chromium-headless-shell`), otherwise through dodi's
screenshot service.

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

Against a local platform on :3001 and its dev database:
- `scripts/e2e-local.ts`: login, approval, kids, manual game edits, assets,
  scopes, access keys, the Access list, logout.
- `scripts/e2e-studio-local.ts`: the studio flow (plan, build, review, a
  change round) with a stand-in model (`scripts/stub-anthropic.ts`), so no
  real AI is called. `E2E_PUBLISH_GAME=1` also publishes (this sends the
  operator notification email when the local platform has one configured).
