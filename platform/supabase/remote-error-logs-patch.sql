-- Idempotent patch to bring an already-initialized REMOTE Supabase up to date
-- with the error_logs table (error telemetry that the local baseline.sql adds
-- but a `db reset` won't re-apply to remote).
--
-- error_logs unifies both error sources behind the ERROR_LOGS env gate
-- (all | client | server | none; unset ⇒ all):
--   type=client — failures of browser-run flows (the BYOK game agent calls the
--     AI provider directly, so nothing reaches our servers), via /api/error-logs.
--   type=server — errors caught in platform API routes (service-role insert,
--     account_id may be NULL).
-- Reports carry error name/message + operational meta only — never prompts,
-- kid content, or provider keys.
--
-- Supersedes remote-client-errors-patch.sql (2026-07-17, pre-launch: the empty
-- client_errors table is dropped, not migrated).
--
-- Safe to run multiple times. Apply via
--   pnpm db db query --linked -f platform/supabase/remote-error-logs-patch.sql

DROP TABLE IF EXISTS "public"."client_errors";

CREATE TABLE IF NOT EXISTS "public"."error_logs" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "account_id" uuid,
    "kid_id" uuid,
    "game_id" uuid,
    "type" text NOT NULL,
    "context" text NOT NULL,
    "provider" text,
    "model" text,
    "error_name" text,
    "error_message" text,
    "http_status" integer,
    "meta" jsonb,
    "user_agent" text,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "error_logs_type_check" CHECK (("type" = ANY (ARRAY['client'::text, 'server'::text]))),
    CONSTRAINT "error_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE,
    CONSTRAINT "error_logs_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE SET NULL,
    CONSTRAINT "error_logs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL
);

COMMENT ON TABLE "public"."error_logs" IS 'Error telemetry, gated by ERROR_LOGS (all|client|server|none; unset ⇒ all). type=client: failures of browser-run flows (BYOK agent loops etc.) that never touch our servers, reported via /api/error-logs. type=server: errors caught in platform API routes. Sanitized client-side AND capped server-side: error name/message + operational meta only — never prompts, kid content, or provider keys.';

CREATE INDEX IF NOT EXISTS "error_logs_account_created_idx" ON "public"."error_logs" USING btree ("account_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "error_logs_created_at_idx" ON "public"."error_logs" USING btree ("created_at" DESC);

ALTER TABLE "public"."error_logs" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can create own error logs" ON "public"."error_logs";
CREATE POLICY "Users can create own error logs" ON "public"."error_logs"
  FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));

DROP POLICY IF EXISTS "Users can view own error logs" ON "public"."error_logs";
CREATE POLICY "Users can view own error logs" ON "public"."error_logs"
  FOR SELECT USING (("auth"."uid"() = "account_id"));

GRANT ALL ON TABLE "public"."error_logs" TO "anon";
GRANT ALL ON TABLE "public"."error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."error_logs" TO "service_role";
