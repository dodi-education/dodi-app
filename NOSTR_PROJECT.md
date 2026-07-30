# Nostr Foundation & Account Export

Plan for portable parent identity (`nsec` / `npub`), later decentralized discovery,
and encrypted account export/import for self-host. Complements [PROJECT.md](./PROJECT.md)
(product) and [docs/auth-setup.md](./docs/auth-setup.md) (hosted Supabase Auth ops).

**Status:** not launched — schema and crypto changes need no production migration of real users.

---

## Goals

1. **Phase 0 — Nostr foundation:** replace the BIP-39 backup phrase with a Nostr
   `nsec` as the vault recovery root; store `npub` on the account. Keep hosted
   **email + password** auth (email mandatory for commercial relationship).
2. **Export/import:** parent can download their encrypted data and restore it on a
   self-hosted instance, continuing with the same vault via `nsec`. This also makes us automatically GDPR compliant in the EU.
3. **Later (out of scope for Phase 0):** pure `nsec` login for self-hosters;
   Nostr-relay discovery of families, games, and self-hosted servers.

Non-goals for Phase 0: relays, custom event kinds in production, NIP-07 UX,
dropping Supabase GoTrue on hosted, Google/social OAuth, kid keys on Nostr.

---

## Current model (baseline)

Two locks share one password string at setup; the seed is recovery-only.

| Layer | Role | Material |
|-------|------|----------|
| **Supabase Auth** | Session JWT, RLS (`auth.uid()`), email identity | Email + password |
| **Vault root** | Deterministic VMK for all E2EE fields | 12-word BIP-39 phrase |
| **Password wrap** | Daily vault unlock on any browser | Argon2id(password) → unwrap VMK |
| **Device wraps** | Silent unlock after first open on a browser | ML-KEM device key → unwrap VMK |

- Seed **not** needed for normal multi-device login if password is known.
- Forgot-password (cold): email OTP + **new password + phrase** to re-wrap vault.
- Warm password change (vault unlocked): no phrase; re-wrap from in-memory VMK.
- Lose password **and** phrase **and** all authorized devices → data unrecoverable.

Code anchors: `core/crypto/src/mnemonic.ts`, `core/crypto/src/keys.ts`,
`core/vault/src/account-keys.ts`, `clients/web/src/stores/vault-store.ts`.

---

## Target architecture

```text
                    nsec (32-byte secret, client-only)
                         │
            ┌────────────┼────────────────────┐
            │            │                    │
            ▼            ▼                    ▼
     VMK = HKDF      npub (public)     future: sign Nostr
     (dodi/vmk/v1)   on accounts       discovery events
            │
            ├── passwordWrap     (hosted daily unlock; unchanged UX)
            ├── deviceWraps[]    (silent unlock; unchanged)
            └── vmkCheck         (verify nsec before trusting VMK)
```

| Hosted (commercial) | Self-host (later flag) |
|---------------------|-------------------------|
| Email **mandatory** | Email optional / off |
| Password login via Supabase Auth | `nsec` challenge session |
| `nsec` = vault root + recovery | `nsec` = session + vault |
| `npub` on account | Same `npub` shape |

**Internal id** stays `accounts.id` (UUID) for FKs, billing, RLS.  
**Portable public id** is `npub`. Discovery and export identity key off `npub`, not email.

Domain separation: VMK derivation must **not** reuse raw Nostr signing key material
without an info string (`dodi/vmk/v1`). Never store `nsec` server-side.

---

## Phase 0 — Nostr foundation

### 0.1 Crypto (`@dodi/crypto`)

- Add `nsec` helpers (new module, e.g. `nsec.ts`; retire or thin-wrap `mnemonic.ts`):
  - generate 32-byte secret → bech32 `nsec1…`
  - parse/validate `nsec` (and optionally hex)
  - `nsec` → `npub` (Nostr x-only pubkey, bech32 `npub1…`)
  - `deriveVaultMasterKeyFromNsec(nsec) → VMK` via HKDF-SHA256, info `dodi/vmk/v1`
- Keep encoding UX as **one string** (bech32). Optional later: BIP-39 as an
  alternate encoding of the same entropy (not required for Phase 0).
- Tests: generate/import round-trip, invalid nsec rejected, VMK stable, wrong nsec
  fails `vmkCheck` path.

### 0.2 Vault (`@dodi/vault`)

- `createAccountVault`: generate or accept imported nsec; return
  `{ nsec, npub, vmk, storedKeys }` instead of `backupPhrase`.
- `unlockVaultWithPhrase` → `unlockVaultWithNsec` (same `vmkCheck` verification).
- `resetVaultPasswordWithPhrase` → nsec equivalent.
- Password wrap + device wraps **unchanged** in structure.
- Update vault unit tests and web `vault-store` (pending backup field names, copy).

### 0.3 Schema

```sql
-- Conceptual; ship as a new migration (or baseline merge pre-launch).
ALTER TABLE public.accounts
  ADD COLUMN npub text UNIQUE;

COMMENT ON COLUMN public.accounts.npub IS
  'Nostr public key (canonical storage form TBD: hex preferred). Set at vault bootstrap. Never store nsec.';
```

- Canonical DB form: prefer **hex** (stable, case-normalized); UI shows bech32.
- Unique: one npub → one account (import existing Nostr key cannot double-bind).
- Set when vault is first created/finalized; null only for legacy/pre-vault rows
  (pre-launch: treat vault bootstrap as required).

Update `@dodi/types` `Database` types and any account API serializers.

### 0.4 Platform API

- On vault keys save / bootstrap completion: accept and persist `npub` for the
  authenticated account (or derive server-side only if client sends npub and
  server trusts client — prefer client computes both from nsec, server stores
  npub after basic format validation; never accept nsec).
- Reject if `npub` already owned by another account.
- No relay endpoints in Phase 0.

### 0.5 Web client / UX

| Surface | Change |
|---------|--------|
| Register + vault finalize | Generate nsec (default) or **import** nsec (advanced) |
| Backup screen (`/vault-setup`) | Show `nsec` once; acknowledge; never re-display from server |
| Vault unlock prompt | Password (default) or recover with nsec |
| Forgot / update password | Cold reset: new password + **nsec** (same as phrase today) |
| Settings change password | Warm path: still no nsec if vault unlocked |
| Copy / i18n | “Recovery phrase” → “Account key (nsec)” / equivalent DE |

Import path is required in Phase 0 even if Discover is off — enables “I already
have a Nostr key” and future federation without a second migration.

### 0.6 Hosted auth policy (unchanged for Phase 0)

- Keep Supabase email/password, confirm email, invite hook, password reset email.
- Email **mandatory** on hosted (commercial contact, receipts, support).
- Do **not** implement social OAuth.
- Password remains daily multi-device vault unlock + GoTrue credential.
- Clarify product copy: password unlocks data day-to-day; **nsec** is the only
  recovery root if password and devices are lost.

### 0.7 Explicitly deferred (Phase 0)

- [ ] `AUTH_MODE=nsec` / disable email-password for self-host
- [ ] Parent session via nsec challenge (mirror device token flow)
- [ ] Nostr relays, event kinds, NIP-01 publish
- [ ] Discover via gossip / server ads
- [ ] NIP-07 browser extension as primary login
- [ ] Optional email on hosted

### 0.8 Phase 0 acceptance criteria

- [ ] New accounts: no BIP-39 phrase in UI or vault bootstrap path
- [ ] VMK derived only from nsec; password wrap still unlocks on any browser
- [ ] `accounts.npub` set and unique after vault setup
- [ ] Import nsec at setup produces matching npub and stable VMK
- [ ] Forgot-password requires nsec when vault exists; wrong nsec does not update auth password
- [ ] nsec never leaves the client (not in API bodies, logs, or DB)
- [ ] Device silent unlock and agent device tokens still work
- [ ] Crypto + vault + critical web flows tested

### 0.9 Suggested implementation order

1. Crypto nsec module + tests  
2. Vault create/unlock/reset API rename + tests  
3. DB `npub` + types  
4. Platform persist npub  
5. Web register / vault-setup / unlock / reset-password + i18n  
6. Remove dead mnemonic exports if unused  

---

## Phase 1 — Self-host auth flag (after Phase 0)

Not required for export design, but locks the portability story.

| Setting | Hosted default | Self-host option |
|---------|----------------|------------------|
| Email required | yes | no |
| Password login | yes (Supabase) | off |
| Session | GoTrue JWT | nsec challenge → platform-signed bearer (like `dodidev_` device tokens) |
| Vault unlock | password wrap and/or nsec | nsec (+ new device wraps) |

Account row still has `npub` (+ optional email). Discovery remains npub-centric.

---

## Account export & import

### Intent

Parent downloads **their encrypted vault and related personal ciphertext** and
restores it on another deployment (especially self-host), then continues with
**the same nsec** → same VMK → same decrypted life.

```text
Hosted account                          Self-host instance
────────────────                        ──────────────────
email+pw session                        AUTH_MODE=nsec
nsec (user holds)  ──────────────────►  nsec login + unlock
export bundle (ciphertext + npub)  ──►  import → account by npub
```

### What the export is

Versioned, parent-triggered download (e.g. `dodi-export/v1`).

**Include**

- Format version + created_at  
- `account_id` (UUID, for FK rewrite / idempotency)  
- `npub`  
- `vault_keys` (at least `vmkCheck`; password/device wraps optional baggage)  
- All E2EE collections owned by the account (kids, personas, private games,
  memory, sealed API keys, snapshots payloads as stored, etc. — whatever is
  sealed under the account VMK or kid keys wrapped under it)  
- Deliberately public account fields needed to resume product: e.g.
  `publication_handle`, locale/date prefs (if not host-bound)

**Exclude**

- `nsec` (user keeps separately)  
- Other users’ data  
- Hosted billing / credits / Stripe / dodi-com commercial rows  
- Service-role or platform secrets  
- Cross-account friendships as live graph (optional: export local sealed friend
  material only; re-pair peers later)  
- Host operational logs, invite redemptions, admin review state  

Product line: **export = your encrypted family data**, not a clone of the
commercial platform relationship.

### Unlock after import

1. Create or match account by **npub** (from bundle; verify user can produce matching nsec).  
2. Write ciphertext + `vault_keys`.  
3. User enters **nsec** → VMK → verify `vmkCheck`.  
4. Register this browser as a new device wrap.  
5. If password auth is off: leave `passwordWrap` null or strip on import.  
6. If password auth is on: optional set password and re-wrap from live VMK.

Old device wraps from the previous host are not expected to work (different
device keys). nsec recovery is the portability path.

### Import rules

- Idempotent: same npub already present → restore into it or refuse with clear error.  
- Verify nsec against `vmkCheck` **before** committing destructive overwrite.  
- Schema version negotiation; reject unknown major versions.  
- Never require email when self-host has email/pw disabled.

### Export implementation sketch (when scheduled)

| Piece | Notes |
|-------|--------|
| `GET/POST` export API or client-side assembly | Prefer client assembly of already-readable ciphertext the session can list; or service export of opaque blobs only for the authed account |
| Integrity | Optional checksum of bundle; not a substitute for nsec |
| UX | Settings → Account export; strong warnings about nsec backup |
| Import UX | Self-host first-run or Settings → Import |

### Export acceptance criteria

- [ ] Export contains no plaintext personal fields the server cannot already see  
- [ ] Export contains no nsec  
- [ ] Import + nsec restores decryptable kids/games/memory on a clean instance  
- [ ] Hosted email/pw account can export; self-host nsec-only can import  
- [ ] npub identity matches across hosts  

---

## Later: discovery on Nostr (sketch only)

Phase 0 does **not** implement this. Identity prerequisites only.

| Idea | Role of nsec/npub |
|------|-------------------|
| Public publisher profile | Signed replaceable event; byline + home URL |
| Game listing | Signed pointer to play/fetch on origin server (not full bundle on relay) |
| Self-host server ad | Signed `base_url` + operator npub |
| Kids | Never Nostr authors; no kid nsec |

Nostr = public discovery bus. Vault, friends E2EE, and play remain on dodi
instances. Official hosted Discover can later index endorsed events without
making relays the private data plane.

Kids-product constraints when discovery ships: parent opt-in only, metadata
minimization, curated default relays, review/endorsement still useful.

---

## Compatibility matrix

| Capability | After Phase 0 | After export | After self-host nsec auth | After discovery |
|------------|---------------|--------------|---------------------------|-----------------|
| Hosted email+pw | yes | yes | yes (hosted) | yes |
| Vault recovery via nsec | yes | yes | yes | yes |
| npub on account | yes | yes | yes | yes |
| Move vault to self-host | design only | yes | yes | yes |
| Login without email | no | no | self-host yes | yes |
| Find other families via relays | no | no | no | yes |

---

## Risks & product notes

- **Password remains a full vault unlock** on hosted (via password wrap), same as today — nsec does not reduce that until password wrap is optional.  
- **Compromise of nsec** = vault + future Nostr identity; treat like today’s seed.  
- **bech32 UX** is easier to store than 12 words but less familiar; import validation and checksum matter.  
- **Commercial email** stays mandatory on hosted; export must not assume email is the account key.  
- **Friend graph / Discover listings** do not fully leave with export until federation exists.

---

## Doc / product checklist

- [x] This plan (`NOSTR_PROJECT.md`)  
- [ ] Implement Phase 0 (crypto → vault → schema → web)  
- [ ] Implement export/import  
- [ ] Self-host `AUTH_MODE`  
- [ ] Discovery event schema (separate design)  
- [x] Remove Google Auth from product docs (not planned)

Related: [PROJECT.md](./PROJECT.md) F1 auth requirements; [docs/auth-setup.md](./docs/auth-setup.md).
