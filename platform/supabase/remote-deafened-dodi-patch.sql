-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the persisted Dodi "deaf" state (what the local baseline.sql now defines
-- but a `db reset` won't re-apply to the linked remote).
--
-- kids.deafened_dodi_at: NULL = Dodi listens normally; a timestamp means the kid
-- deliberately muted Dodi (deafened her). The client reads it on connect and
-- comes up deaf directly — never flashing into the active/listening state —
-- until the kid taps to wake her, which clears it back to NULL. Plaintext
-- operational state (not sensitive), server-visible so it round-trips through
-- the kids API.
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.

ALTER TABLE "public"."kids"
  ADD COLUMN IF NOT EXISTS "deafened_dodi_at" timestamp with time zone;

COMMENT ON COLUMN "public"."kids"."deafened_dodi_at" IS 'Persisted Dodi deaf state: NULL = listens normally; a timestamp = kid muted Dodi, so she comes up deaf on connect until re-enabled. Plaintext operational state.';
