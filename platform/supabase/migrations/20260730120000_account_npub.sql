-- Nostr foundation (NOSTR_PROJECT.md Phase 0): the vault recovery root is now a
-- Nostr nsec; the matching PUBLIC key is stored on the account. Canonical
-- storage is lowercase hex (x-only schnorr pubkey); the UI renders bech32
-- npub1…. The client computes it from the nsec at vault bootstrap and the
-- server only validates the format — it never sees the nsec.

-- forward:

ALTER TABLE "public"."accounts"
  ADD COLUMN IF NOT EXISTS "npub" "text";

ALTER TABLE "public"."accounts"
  ADD CONSTRAINT "accounts_npub_key" UNIQUE ("npub");

ALTER TABLE "public"."accounts"
  ADD CONSTRAINT "accounts_npub_format_check"
    CHECK (("npub" IS NULL) OR ("npub" ~ '^[0-9a-f]{64}$'));

COMMENT ON COLUMN "public"."accounts"."npub" IS 'Nostr public key of the vault root (x-only schnorr pubkey, lowercase hex; UI shows bech32 npub1…). Set once at vault bootstrap; unique — one npub binds to one account. Never store the nsec.';

-- reverse:
-- ALTER TABLE "public"."accounts" DROP CONSTRAINT IF EXISTS "accounts_npub_format_check";
-- ALTER TABLE "public"."accounts" DROP CONSTRAINT IF EXISTS "accounts_npub_key";
-- ALTER TABLE "public"."accounts" DROP COLUMN IF EXISTS "npub";
