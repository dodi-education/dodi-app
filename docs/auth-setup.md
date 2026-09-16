# Auth setup: registration modes, invite codes & email

Auth is [Better Auth](https://www.better-auth.com) (MIT), running **inside the
platform** with its tables in the platform database. There is no external auth
service and no dashboard to configure: everything below is code, environment,
and SQL in this repo.

Four things are layered on top of email + password:

1. **Registration modes** (`open` / `invite` / `closed`) via the
   `REGISTRATION_MODE` env var on the platform.
2. **Invite codes** — admin-managed rows in `invite_codes` (no UI), enforced in
   a Better Auth database hook before any user row is written.
3. **Email confirmation + delivery** — a 6-digit one-time code, entered in-page,
   sent through **Resend**. Confirmation is required, and it is also our
   account-enumeration protection.
4. **Bot protection** — an optional Cloudflare Turnstile check on sign-up,
   sign-in and the password-reset code sender (`TURNSTILE_*` env vars).

Everything auth-related is behind `platform/src/lib/auth.ts`, so the library
stays swappable (the planned key-based `npub` login lands as a plugin there).

---

## 1. Apply the schema & (optionally) seed a code

The schema lives in `platform/db/migrations/`. The Better Auth tables
(`auth_users`, `auth_sessions`, `auth_accounts`, `auth_verifications`), the
invite tables, `redeem_invite_code` / `is_invite_code_active`, and
`handle_new_user()` are all part of the baseline.

```bash
# local Postgres (repo root)
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @dodi/platform db:migrate
pnpm --filter @dodi/platform db:seed     # seeds an active DODI-BETA code
```

`db:reset` rebuilds the local database from scratch (it wipes data).

Manage codes with SQL (no admin UI):

```sql
insert into public.invite_codes (code, note) values ('FRIENDS-2026', 'launch batch');
update public.invite_codes set is_active = false where code = 'FRIENDS-2026';
-- who redeemed what:
select c.code, r.account_id, r.redeemed_at
from public.invite_code_redemptions r
join public.invite_codes c on c.id = r.invite_code_id;
```

Codes are **reusable while active**; every redemption is recorded. `max_uses` is
reserved for future per-code limits (null = unlimited).

## 2. Platform env

See `platform/.env.local.example`:

- `DATABASE_URL_APP` / `DATABASE_URL_SERVICE` / `DATABASE_URL_MIGRATOR`
- `BETTER_AUTH_SECRET` — signs sessions. Generate: `openssl rand -base64 32`
- `BETTER_AUTH_URL` — the platform's public origin
- `REGISTRATION_MODE=open|invite|closed`
- `CORS_ALLOWED_ORIGINS` — the web app origin; it doubles as the trusted-origin
  list for auth
- `RESEND_API_KEY` + `EMAIL_FROM` — see below
- `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` — optional bot protection, see §4

Rotating `BETTER_AUTH_SECRET` invalidates every existing session (everyone is
signed out). It does **not** touch passwords or the E2EE vault.

## 3. Email delivery (Resend)

All transactional email, including the one-time codes, goes out through the
Resend SDK from `platform/src/lib/email.ts`. There is no SMTP to configure.

- `RESEND_API_KEY` — the API key.
- `EMAIL_FROM` — must be on a Resend-verified domain. Verified: **`mail.dodi.app`**
  (prod) and **`dev-mail.dodi.app`** (dev). The apex `dodi.app` is **not**
  verified, so an unset or apex sender fails to send.

The code email is `platform/src/emails/auth-code.tsx` (English + German copy in
`emails/strings.ts`), one template covering sign-up confirmation, password reset
and sign-in codes.

If codes do not arrive: check `RESEND_API_KEY` is set (an unset key logs a
warning and skips the send), check `EMAIL_FROM` is on a verified domain, and
check the Resend dashboard's delivery log. A send failure surfaces to the
caller as a 500 rather than failing silently.

## 4. Bot protection (Cloudflare Turnstile)

Sign-up, password sign-in and the one-time-code sender (password reset, code
resends) can require a [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/)
token. Turnstile is a one-click captcha: most visitors never see anything, the
rest get a single checkbox, never an image puzzle. It sets no tracking cookies
and is free without a traffic cap. It is **off by default** (self-host mode).

### Set it up

1. In the Cloudflare dashboard open **Turnstile** and add a widget. Hostnames:
   the web app origin (`app.dodi.app`; add `localhost` for local dev). Widget
   mode: **Managed** (Cloudflare decides when a checkbox is needed).
   Pre-clearance: off.
2. Put the pair into the **platform** env (`platform/.env.local` locally,
   `ops/hosting/env/platform.env` in dodi-com for prod) and restart it:

   ```bash
   TURNSTILE_SITE_KEY=0x4AAAAAAA...      # public, shown in the widget settings
   TURNSTILE_SECRET_KEY=0x4AAAAAAA...    # server only
   ```

   Both set ⇒ enforced. Neither ⇒ off. Only one ⇒ stays off and logs a
   warning at startup, so a half-configured pair can never lock parents out.
3. Nothing to configure on the web client: it asks
   `GET /api/auth/captcha-config` whether a token is required and which site
   key to render with, so the platform is the single switch and the two sides
   cannot disagree. No rebuild of the web image is needed to turn it on or off.

For local development without a Cloudflare account, Cloudflare's test keys
always pass (`TURNSTILE_SITE_KEY=1x00000000000000000000AA`,
`TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`); the site key
`3x00000000000000000000FF` forces the visible checkbox to test that path, and
`2x00000000000000000000AB` always blocks.

### How it is enforced

- The browser renders the widget (`clients/web/src/components/auth/captcha.tsx`)
  in execute mode with `appearance: "interaction-only"`: invisible until a form
  asks for a token, and the checkbox shows only when Cloudflare requires it.
  Every submit fetches a fresh single-use token and sends it in the
  `x-captcha-response` header (Better Auth's captcha contract).
- Better Auth's `captcha` plugin (`platform/src/lib/auth.ts`) gates
  `/sign-up/email`, `/sign-in/email`, `/email-otp/send-verification-otp`,
  `/request-password-reset` and `/forget-password` over HTTP. A missing token is
  `400 MISSING_RESPONSE`, a rejected one `403 VERIFICATION_FAILED`; the client
  maps both to `auth.captchaFailed`. Code **entry** (`/email-otp/verify-email`,
  `/sign-in/email-otp`) is deliberately not gated: it is bounded by the
  5-attempt OTP limit and the per-path rate limit.
- `POST /api/auth/register` calls `auth.api.signUpEmail` in-process, where the
  plugin never sees the request, so it verifies the token itself
  (`platform/src/lib/captcha.ts`) before the call. A token is spent on first
  verification, so each request is checked exactly once.
- In the reset flow a captcha rejection is the one send failure that does
  **not** advance to the code step (it says nothing about whether the email
  exists, and advancing would park the parent on a code that was never sent).

---

## How it fits together

- The web client posts to **`POST /api/auth/register`** with
  `{ email, password, inviteCode? }`. That route wraps Better Auth's sign-up so
  that **every well-formed request answers `{ ok: true }`**, whether or not the
  address is already registered. Sign-up therefore cannot be used to probe for
  accounts.
- Before any user row is inserted, the **registration gate** in
  `platform/src/lib/auth.ts` reads `REGISTRATION_MODE` and validates the invite
  code via `is_invite_code_active`. It runs for **every** new user, so it cannot
  be bypassed. Failures come back as HTTP 400 with a message (codes
  `REGISTRATION_CLOSED`, `INVITE_CODE_REQUIRED`, `INVITE_CODE_INVALID`).
- On allow, the user row is written and the SQL trigger `handle_new_user()` on
  `auth_users` creates the `public.accounts` row and records the invite
  redemption, in the same transaction as the insert.
- A **6-digit code** is emailed. The user enters it on `/register` in the same
  tab: `emailOtp.verifyEmail` marks the address verified and signs them in. The
  E2EE vault, built in memory at signup and sealed under a non-extractable
  AES-GCM key (`clients/web/src/lib/sealed-secret.ts`), is then persisted and its
  recovery phrase shown (`/vault-setup`). The plaintext password is used once to
  build the vault's one-way password-wrap, then dropped: it is never stored.
- Signing in before verifying returns `EMAIL_NOT_VERIFIED` and sends a fresh
  code, so the login page can finish the confirmation in place.
- **Password reset** is the same shape: a sign-in code
  (`emailOtp.sendVerificationOtp` with type `sign-in`, then `signIn.emailOtp`)
  establishes a session, then `/update-password` calls
  **`POST /api/auth/password/set`** and re-wraps the vault with the recovery
  phrase. Both flows are in-page, so there is no callback route and no
  cross-device link problem. Requesting a reset for an unknown address returns
  success and sends nothing.
- **Changing the password** while signed in uses the same
  `POST /api/auth/password/set`, followed by the vault re-wrap. Setting a
  password revokes every other session.
- The parent-PIN "forgot" escape hatch proves the account password with
  **`POST /api/auth/password/verify`** (`{ ok: boolean }`), which never mints a
  session.
- `/finish-setup` remains only as the "authenticated but no vault" safety net
  (a persist that failed after confirm, or a post-reset account that predates the
  vault); registration no longer routes through it.

## Sessions and clients

Sessions are rows in `auth_sessions` (30 days, refreshed at most daily), so
revoking one takes effect immediately.

Clients are **bearer-only**, matching the pre-existing split between the web app
and the API:

- The web app stores the token handed back in the `set-auth-token` response
  header and sends it as `Authorization: Bearer …`. It also mirrors it into a
  first-party `dodi-session` cookie so its own middleware can check auth
  server-side (`clients/web/src/lib/auth/client.ts`).
- `platform/src/lib/resolve-auth.ts` resolves that bearer to
  `{ accountId, db, via }`. Device tokens (the agent) keep their own
  HMAC-signed path and are unchanged.
- **ai.dodi.app** verifies the same bearer by calling
  `GET /api/auth/get-session` on the platform, so there is one identity and one
  login across both APIs.

## Testing it

- `platform/src/lib/auth.integration.test.ts` drives the whole flow (gate,
  sign-up, code, verification, sign-in, password set/verify, enumeration
  behaviour) against a real Postgres. It runs when `DATABASE_URL_SERVICE` is
  set and skips otherwise:

  ```bash
  cd platform
  DATABASE_URL_SERVICE=postgres://dodi_service:dodi_service@127.0.0.1:5432/dodi_platform \
    npx vitest run src/lib/auth.integration.test.ts
  ```
