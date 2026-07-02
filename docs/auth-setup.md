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
- Site URL + **Redirect URLs** must include every origin the app is served from,
  incl. the dev host: `https://192.168.1.23:3000` (and `/auth/callback`). Without
  this, confirmation links won't return to the dev machine.

Authentication → **Emails**
- Turn **Confirm email** ON (matches `config.toml enable_confirmations = true`).
  This is what makes signup non-enumerable — an already-registered email gets a
  generic "check your email" instead of "User already registered".
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
- Supabase sends the confirmation email via Resend. The link returns to
  `/auth/callback`; after confirm + sign-in the E2EE vault bootstraps.
