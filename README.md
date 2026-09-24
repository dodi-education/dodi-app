<p align="center">
  <img src="assets/reference/dodi_full.png" alt="Dodi — a blue robot dodo bird mascot" width="170" />
</p>

<h1 align="center">Dodi</h1>

<p align="center">
  A personalized, AI-powered learning platform for kids — guided by <strong>Dodi</strong>, a friendly blue robot dodo bird.
</p>

---

## What is Dodi?

Dodi turns screen time into personalized, playful education. At its center is **Dodi**, a blue robot dodo bird companion who talks with kids (by text or voice), builds educational games tailored to each child, and adapts its language, tone, and difficulty to the child's age, skills, and interests.

Parents stay fully in control through a PIN-protected configuration view: they craft and assign Dodi's personality, choose the AI providers and models, and can read or edit everything the companion has learned. Kids get a deliberately minimal, playful interface where Dodi drives the navigation and interaction.

For more information, visit [dodi.app](https://dodi.app/).

## Highlights

- **Dodi companion** — an animated mascot with text and voice chat that adapts to each child.
- **AI-generated games** — educational exercises generated as HTML/CSS/JS and run inside a locked-down sandboxed iframe.
- **Living memory** — the companion keeps a markdown "memory dossier" per child (an AI-agentic-first design) that parents can read and edit as plain text.
- **Friends** — kids connect via name tags / QR codes and share games, exchanged as end-to-end-encrypted friend cards.
- **Privacy-first** — sensitive profile and social data is end-to-end encrypted and provider-blind, built on post-quantum-ready cryptography.
- **Pluggable AI** — provider adapters (Anthropic, Google Gemini) selected per account.
- **Internationalized** — English and German out of the box.

## Tech stack

Next.js (App Router) · React 19 · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL, organized as a pnpm + Turborepo monorepo:

```
clients/web   — kid- and parent-facing Next.js app
platform      — backend-for-frontend, API routes, AI proxy, database migrations
core/*        — shared packages: ai, games, crypto, vault, protocol, types
```

## Self-hosting

You can run your own Dodi instance, for example for your family and friends. A self-hosted instance is **bring-your-own-key only**: parents enter their own AI provider key (Anthropic, Google Gemini, …) in the app. The key is encrypted in the browser and never reaches your server. The hosted "dodi AI" credits are not available on self-hosted instances.

### What you need

- A Linux server with [Docker](https://docs.docker.com/engine/install/) and Docker Compose, and about 4 GB of RAM
- Two hostnames pointing at the server (DNS `A`/`AAAA` records), one for the app and one for its API, e.g. `dodi.example.com` and `api.dodi.example.com`. HTTPS certificates are issued automatically by [Caddy](https://caddyserver.com).
- A [Resend](https://resend.com) account with a verified sending domain. Sign-up and sign-in confirm the email address with a one-time code, so accounts cannot be created without working email.

### 1. Get the code and create a deployment folder

The deployment files live in a folder next to the checkout, so `git pull` never touches them:

```bash
git clone https://github.com/dodi-education/dodi-app.git
mkdir dodi-selfhost && cd dodi-selfhost
```

### 2. Add the configuration files

Create these files inside `dodi-selfhost/`. Generate every secret with `openssl rand -hex 32`.

<details>
<summary><code>.env</code>: your hostnames</summary>

```bash
APP_DOMAIN=dodi.example.com
API_DOMAIN=api.dodi.example.com
```

</details>

<details>
<summary><code>postgres.env</code>: database passwords</summary>

```bash
POSTGRES_PASSWORD=<secret>
DODI_MIGRATOR_PASSWORD=<secret>
DODI_APP_PASSWORD=<secret>
DODI_SERVICE_PASSWORD=<secret>
# Unused when self-hosting, but the init script expects it.
DODI_COM_PASSWORD=<secret>
```

</details>

<details>
<summary><code>platform.env</code>: the API server</summary>

```bash
# Use the passwords from postgres.env.
DATABASE_URL_APP=postgres://dodi_app:<DODI_APP_PASSWORD>@postgres:5432/dodi_platform
DATABASE_URL_SERVICE=postgres://dodi_service:<DODI_SERVICE_PASSWORD>@postgres:5432/dodi_platform
DATABASE_URL_MIGRATOR=postgres://dodi_migrator:<DODI_MIGRATOR_PASSWORD>@postgres:5432/dodi_platform

BETTER_AUTH_SECRET=<secret>
BETTER_AUTH_URL=https://api.dodi.example.com
DEVICE_TOKEN_SECRET=<secret>
CORS_ALLOWED_ORIGINS=https://dodi.example.com
NEXT_PUBLIC_APP_URL=https://dodi.example.com

# open | invite | closed. With "invite", new accounts need an invite code (see below).
REGISTRATION_MODE=invite

# Email (required: sign-up and sign-in send one-time codes).
RESEND_API_KEY=re_...
EMAIL_FROM="dodi <no-reply@mail.example.com>"
EMAIL_ASSET_BASE_URL=https://api.dodi.example.com

# Optional: the Game Studio's visual check (screenshot service below).
SCREENSHOT_SERVICE_URL=http://screenshot:3006
SCREENSHOT_SERVICE_SECRET=<secret>
```

All other options (bot protection, error logging, …) are documented in [`platform/.env.local.example`](platform/.env.local.example) and [`docs/auth-setup.md`](docs/auth-setup.md).

</details>

<details>
<summary><code>screenshot.env</code>: optional headless-browser worker</summary>

```bash
# Must equal SCREENSHOT_SERVICE_SECRET in platform.env.
SCREENSHOT_SERVICE_SECRET=<secret>
MAX_CONCURRENT_RENDERS=2
```

</details>

<details>
<summary><code>Caddyfile</code>: HTTPS reverse proxy</summary>

```
{$APP_DOMAIN} {
	encode zstd gzip
	reverse_proxy web:3000
}

{$API_DOMAIN} {
	encode zstd gzip
	reverse_proxy platform:3001
}
```

</details>

<details>
<summary><code>docker-compose.yml</code></summary>

```yaml
name: dodi

services:
  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    env_file: postgres.env
    volumes:
      - pgdata:/var/lib/postgresql/data
      # Creates the database roles and databases on first start.
      - ../dodi-app/platform/db/docker/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d postgres"]
      interval: 10s
      timeout: 5s
      retries: 10

  platform:
    build:
      context: ../dodi-app
      dockerfile: platform/Dockerfile
      args:
        NEXT_PUBLIC_APP_URL: https://${APP_DOMAIN}
    restart: unless-stopped
    env_file: platform.env
    depends_on:
      postgres:
        condition: service_healthy

  web:
    build:
      context: ../dodi-app
      dockerfile: clients/web/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: https://${API_DOMAIN}
        NEXT_PUBLIC_APP_URL: https://${APP_DOMAIN}
        # Empty = self-host mode: dodi AI is hidden, bring-your-own-key only.
        NEXT_PUBLIC_DODI_AI_URL: ""
    restart: unless-stopped
    environment:
      NEXT_PUBLIC_API_URL: https://${API_DOMAIN}
      NEXT_PUBLIC_APP_URL: https://${APP_DOMAIN}
      API_URL_INTERNAL: http://platform:3001
    depends_on:
      - platform

  # Optional: remove this service (and the SCREENSHOT_* lines) to skip it.
  screenshot:
    build:
      context: ../dodi-app
      dockerfile: screenshot/Dockerfile
    restart: unless-stopped
    env_file: screenshot.env
    shm_size: "512m"
    init: true

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"
    environment:
      APP_DOMAIN: ${APP_DOMAIN}
      API_DOMAIN: ${API_DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - platform
      - web

  # One-shot database migrations: docker compose run --rm migrate
  migrate:
    build:
      context: ../dodi-app
      dockerfile: platform/Dockerfile
      target: installer
      args:
        NEXT_PUBLIC_APP_URL: https://${APP_DOMAIN}
    profiles: ["migrate"]
    restart: "no"
    env_file: platform.env
    working_dir: /repo
    command: ["pnpm", "--filter", "@dodi/platform", "db:migrate"]
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

</details>

### 3. Build, migrate and start

```bash
docker compose build                 # takes a while the first time
docker compose up -d postgres
docker compose run --rm migrate      # creates the database schema
docker compose up -d
```

Open `https://dodi.example.com` and create your parent account.

With `REGISTRATION_MODE=invite`, create an invite code first:

```bash
docker compose exec postgres psql -U postgres -d dodi_platform \
  -c "insert into invite_codes (code, note) values ('FAMILY-2026', 'family');"
```

Once everyone has signed up, you can set `REGISTRATION_MODE=closed` and run `docker compose up -d platform`.

### Updating

```bash
cd ../dodi-app && git pull && cd ../dodi-selfhost
docker compose build
docker compose run --rm migrate
docker compose up -d
```

### Backups

All data lives in the `pgdata` volume. Back it up regularly, for example with a nightly dump:

```bash
docker compose exec -T postgres pg_dump -U postgres -Fc dodi_platform > dodi-$(date +%F).dump
```

## License

Dodi is free software, licensed under the **GNU Affero General Public License v3.0** — see [`LICENSE`](LICENSE) (SPDX: `AGPL-3.0-only`).

You are free to use, study, modify, and self-host Dodi, including running a private instance for your own family and friends. Because Dodi is a network application, the AGPL's **section 13** applies: if you run a modified version and make it available to others over a network, you must also offer those users the complete corresponding source code of your modified version.

Built with ❤️ by Alexander Birke & family for other families around the world.
