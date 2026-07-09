# Auth setup: registration modes, invite codes & email

Auth stays owned by Supabase (client-side `supabase.auth.*`). Three things are
layered on top:

1. **Registration modes** (`open` / `invite` / `closed`) via the
   `REGISTRATION_MODE` env var on the platform.
2. **Invite codes** — admin-managed rows in `invite_codes` (no UI), enforced by a
   Supabase **Before User Created** HTTP hook that calls the platform.
3. **Email confirmation + delivery** — Supabase "Confirm email" (also our
   account-enumeration protection) with **Resend** as the SMTP provider.

Most of this is code + a DB migration; the rest is Supabase **dashboard** config
(the hosted project can't be configured from this repo). Steps below.

---

## 1. Apply the schema & (optionally) seed a code

The schema lives in the single authoritative baseline
`platform/supabase/migrations/20260613120000_baseline.sql` (the invite tables,
`redeem_invite_code`/`is_invite_code_active`, and the updated `handle_new_user`
are in its "INVITE SYSTEM" section). Apply per the repo convention:

- **Local Supabase:** `npx supabase db reset` (from `platform/`; rebuilds from
  baseline + runs `seed.sql`, which seeds an active `DODI-BETA` code). A reset
  wipes data.
- **Remote (hosted):** a `db reset` won't touch it — apply the idempotent
  `platform/supabase/remote-invite-system-patch.sql` via the Supabase SQL editor
  or psql (safe to re-run).

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

Set on the platform (`platform/.env.local`, and Vercel for prod) — see
`platform/.env.local.example`:

- `REGISTRATION_MODE=open|invite|closed`
- `BEFORE_USER_CREATED_HOOK_SECRET=v1,whsec_...` (from the dashboard, step 4)

## 3. Hosted Supabase dashboard — required

Authentication → **URL Configuration**
- Set the **Site URL**. Registration and password reset use email **OTP codes**
  entered in-page (no redirect), so no `/auth/callback` Redirect URL entry is
  needed for them.

Authentication → **Emails**
- Turn **Confirm email** ON (matches `config.toml enable_confirmations = true`).
  This is what makes signup non-enumerable — an already-registered email gets a
  generic "check your email" instead of "User already registered".
- **Templates** → edit **Confirm signup** and **Reset password** to render the
  6-digit code `{{ .Token }}` (the in-page flows verify a code; a magic-link
  template won't deliver one). **Required on the hosted project** — this is the
  gating step for the OTP flows to work against remote Supabase. (Local dev gets
  the same via `config.toml` `[auth.email.template.confirmation|recovery]`.)
- **SMTP Settings** → Resend:
  `host smtp.resend.com`, `port 465`, `user resend`, `pass <RESEND_API_KEY>`,
  sender on a **Resend-verified domain** (e.g. `team@mail.dodi.app`).

> Beyond Supabase's auth emails, the platform now also sends **app-level
> transactional email directly via the Resend SDK** (e.g. friend-request
> approval notifications — see `platform/src/lib/email.ts` and
> `platform/src/emails/`). It reuses the same `RESEND_API_KEY`; the sender is
> `EMAIL_FROM` and must be on a Resend-verified domain. Verified domains:
> **`mail.dodi.app`** on the prod Resend instance, **`dev-mail.dodi.app`** on
> the dev instance — the apex `dodi.app` is NOT verified, so an unset
> `EMAIL_FROM` falls back to `dodi <team@mail.dodi.app>` (prod); dev must
> set `EMAIL_FROM="dodi <team@dev-mail.dodi.app>"`.
>
> The email **logo** is served by the platform itself
> (`platform/public/dodi-logo.png` → `https://api.dodi.app/dodi-logo.png`), so
> it doesn't depend on the web app's deploy — override with
> `EMAIL_ASSET_BASE_URL`. Dashboard/settings **links** point at the web app
> (`NEXT_PUBLIC_APP_URL`, default `https://app.dodi.app`).

## 4. Before User Created hook

Authentication → **Hooks** → *Before User Created* → **HTTPS**:
- URI = the **publicly reachable** platform URL:
  `https://api.dodi.app/api/auth/hooks/before-user-created`
- Copy the generated secret into `BEFORE_USER_CREATED_HOOK_SECRET`.

> ⚠️ A configured-but-unreachable hook **fails signups closed**. Only enable it
> once the URL is reachable.

### Reachability on the dev machine
Hosted Supabase calls the hook **server-to-server** and **cannot reach the LAN
dev host** (`192.168.1.23:3001`, self-signed cert). So to test *enforcement*
locally, pick one:

- **Local Supabase** (recommended for hook work): `supabase start`, point the web
  app's `.env` at the local project, and uncomment `[auth.hook.before_user_created]`
  in `config.toml` (already set to `http://host.docker.internal:3001/...` +
  `secrets = env(BEFORE_USER_CREATED_HOOK_SECRET)`). GoTrue-in-Docker can reach
  the dev platform this way.
- **Tunnel**: expose the dev platform with cloudflared/ngrok and point the hosted
  hook at the tunnel URL.

The registration **UI** (open/invite/closed rendering) works on the dev machine
without the hook — the client reads the mode from the dev platform directly; only
*enforcement* needs the reachable hook.

---

## How it fits together

- Client `signUp({ options: { data: { invite_code } } })` → GoTrue fires the hook.
- Hook (`/api/auth/hooks/before-user-created`) verifies the Standard-Webhooks
  signature, reads `REGISTRATION_MODE`, and allows / rejects (closed, or
  missing/invalid invite code). It fires for **every** new user, so it can't be
  bypassed.
- On allow, GoTrue creates the (unconfirmed) user; `handle_new_user()` creates the
  `accounts` row and records the invite redemption (it has the new user id, which
  the hook does not).
- Supabase sends the confirmation email via Resend carrying a **6-digit code**
  (`{{ .Token }}`). The user enters it on `/register` in the same tab:
  `verifyOtp({ type: "signup" })` establishes the session, then the E2EE vault —
  built in memory at signup and sealed under a non-extractable AES-GCM key
  (`clients/web/src/lib/sealed-secret.ts`) — is persisted and its recovery phrase
  shown (`/vault-setup`). The plaintext password is used once to build the vault's
  one-way password-wrap, then dropped — it is never stored.
- **Password reset** works the same way: a code → `verifyOtp({ type: "recovery" })`
  → `/update-password` (set the new password + re-wrap the vault via the recovery
  phrase). Both flows are in-page, so there is no `/auth/callback` and no
  cross-device link problem.
- `/finish-setup` remains only as the "authenticated but no vault" safety net
  (a persist that failed after confirm, or a post-reset account that predates the
  vault); registration no longer routes through it.
