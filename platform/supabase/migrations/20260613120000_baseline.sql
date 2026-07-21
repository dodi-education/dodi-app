


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';


CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";


CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";


CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";


CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";


-- (subscription_tier enum removed — accounts.subscribed_plan is a text plan handle
--  referencing platform_plans.handle; entitlements are copied onto the account.)


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_code text;
begin
  insert into public.accounts (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  -- Record an invite-code redemption if one was supplied at signup (via signUp
  -- options.data.invite_code -> raw_user_meta_data). The before_user_created
  -- hook already gated the code; recording must never block signup. (redeem_
  -- invite_code is defined in the INVITE SYSTEM section below; check_function_
  -- bodies is off so the forward reference is fine.)
  v_code := nullif(btrim(new.raw_user_meta_data ->> 'invite_code'), '');
  if v_code is not null then
    perform public.redeem_invite_code(v_code, new.id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounts" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "encrypted_api_keys" "jsonb",
    "model_config" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vault_keys" "jsonb",
    "date_preferences" "jsonb",
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "parent_pin_enc" "text",
    "notification_preferences" "jsonb" DEFAULT '{"friend_approval_email": true}'::"jsonb" NOT NULL,
    "subscribed_plan" "text" DEFAULT 'egg'::"text" NOT NULL,
    "max_kids" integer DEFAULT 1 NOT NULL,
    "max_custom_personas" integer DEFAULT 2 NOT NULL,
    "max_storage_mb_per_kid" integer DEFAULT 100 NOT NULL,
    "memory_tier" "text" DEFAULT 'basic'::"text" NOT NULL,
    CONSTRAINT "accounts_memory_tier_check" CHECK (("memory_tier" = ANY (ARRAY['basic'::"text", 'advanced'::"text", 'full'::"text"])))
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."accounts"."vault_keys" IS 'Opaque wrapped Vault Master Key material (StoredVaultKeys). Server cannot decrypt it. See src/lib/vault.';

COMMENT ON COLUMN "public"."accounts"."date_preferences" IS 'Plaintext account-level date/time display prefs ({ dateStyle, timeStyle, timeZoneEnc }). An explicit timezone is sealed enc:v1: in timeZoneEnc so the server stays blind.';

COMMENT ON COLUMN "public"."accounts"."language" IS 'Parent UI language (BCP-47 short code, e.g. en/de). Durable source of truth; cached client-side in the NEXT_LOCALE cookie and re-seeded at login.';

COMMENT ON COLUMN "public"."accounts"."parent_pin_enc" IS 'enc:v1: sealed 4-digit parent PIN gating the parent area; null = no PIN. Client-set/verified; server-blind.';

COMMENT ON COLUMN "public"."accounts"."notification_preferences" IS 'Plaintext account-level notification toggles ({ friend_approval_email, ... }). Deliberately NOT E2EE: the server reads these to decide whether to send transactional email (e.g. friend-request approval). Default: all on.';


CREATE TABLE IF NOT EXISTS "public"."game_translations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "locale" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."game_translations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid",
    "kid_id" "uuid",
    "source_game_id" "uuid",
    "system_key" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "target_age_min" integer DEFAULT 4 NOT NULL,
    "target_age_max" integer DEFAULT 12 NOT NULL,
    "estimated_duration_minutes" integer DEFAULT 10 NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "code_bundle" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_by" "text" DEFAULT 'system'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "markdown" "text" DEFAULT ''::"text" NOT NULL,
    "learning_goal" "text" DEFAULT ''::"text" NOT NULL,
    "success_definition" "text" DEFAULT ''::"text" NOT NULL,
    "success_criteria" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "progress_kind" "text" DEFAULT 'open'::"text" NOT NULL,
    -- E2EE enc:v1: sealed JSON of the game-studio conversation (user + dodi
    -- messages) under the account VMK. Lets the parent resume editing where they
    -- left off; the server stores it as an opaque blob and cannot decrypt it.
    "agent_transcript_enc" "text",
    -- Optional 100x100 preview shown in the kid game library. System games point at
    -- a static SVG under /images/game-previews; custom-game screenshots (deferred)
    -- can later fill this same column. NULL ⇒ the UI falls back to a generic icon.
    "preview_image" "text",
    -- The game_versions row whose code_bundle matches this game's code_bundle
    -- (the studio's version history head). NULL for system games and rows whose
    -- code was written before versioning; the service sets it on every code write.
    "current_game_version_id" "uuid",
    CONSTRAINT "games_age_range_check" CHECK (("target_age_min" <= "target_age_max")),
    CONSTRAINT "games_created_by_check" CHECK (("created_by" = ANY (ARRAY['system'::"text", 'parent'::"text", 'kid'::"text"]))),
    CONSTRAINT "games_duration_check" CHECK ((("estimated_duration_minutes" >= 1) AND ("estimated_duration_minutes" <= 180))),
    CONSTRAINT "games_progress_kind_check" CHECK (("progress_kind" = ANY (ARRAY['goal'::"text", 'open'::"text"]))),
    CONSTRAINT "games_system_row_check" CHECK (((("is_system" = true) AND ("account_id" IS NULL) AND ("kid_id" IS NULL) AND ("system_key" IS NOT NULL)) OR (("is_system" = false) AND ("account_id" IS NOT NULL) AND ("system_key" IS NULL))))
);


ALTER TABLE "public"."games" OWNER TO "postgres";


-- Immutable-ish history of a custom game's code, one row per persisted
-- iteration. Rows chain backwards via previous_game_version_id (a tree once a
-- parent restores an old version and keeps editing from there). Agent persists
-- always append a row; manual editor saves append by default but may decline —
-- the head row's code_bundle is then updated in place instead.
-- games.current_game_version_id points at the head row.
CREATE TABLE IF NOT EXISTS "public"."game_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "code_bundle" "text" NOT NULL,
    "previous_game_version_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_versions_pkey" PRIMARY KEY ("id")
);


ALTER TABLE "public"."game_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_sharings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kid_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_sharings_pkey" PRIMARY KEY ("id")
);


ALTER TABLE "public"."game_sharings" OWNER TO "postgres";


-- Per-kid favorite games. A kid marks a game with the heart in the library; the
-- account owns the row (RLS on account_id), kid_id scopes it to the profile.
CREATE TABLE IF NOT EXISTS "public"."game_favorites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kid_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_favorites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "game_favorites_kid_game_uniq" UNIQUE ("kid_id", "game_id")
);


ALTER TABLE "public"."game_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_plays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kid_id" "uuid" NOT NULL,
    "game_id" "uuid" NOT NULL,
    "progress_kind" "text" DEFAULT 'open'::"text" NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ended_at" timestamp with time zone,
    "succeeded" boolean DEFAULT false NOT NULL,
    "succeeded_at" timestamp with time zone,
    "final_progress" numeric DEFAULT 0 NOT NULL,
    "metrics" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_plays_progress_kind_check" CHECK (("progress_kind" = ANY (ARRAY['goal'::"text", 'open'::"text"]))),
    CONSTRAINT "game_plays_progress_range_check" CHECK ((("final_progress" >= (0)::numeric) AND ("final_progress" <= (1)::numeric)))
);


ALTER TABLE "public"."game_plays" OWNER TO "postgres";


-- Append-only AI usage ledger. One row per client-side AI provider call (plus
-- voice active-minute cycles). Token counts + model/provider + measured context
-- sizes only (meta_*) — never prompt/response content, so it stays provider-blind.
-- Cost is NOT tracked (BYOK: the provider's own dashboards are the source of truth
-- for money). No updated_at / no UPDATE|DELETE policy: rows are immutable facts.
-- kid_id/game_id SET NULL on delete so usage history survives profile/game removal.
CREATE TABLE IF NOT EXISTS "public"."usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kid_id" "uuid",
    "game_id" "uuid",
    "event_type" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text" NOT NULL,
    "input_tokens" integer,
    "output_tokens" integer,
    "cache_write_tokens" integer,
    "cache_read_tokens" integer,
    "voice_seconds" integer,
    -- Client-measured context/output sizes per call (chars/counts), one column
    -- per component so we can track how they evolve across users over time.
    "meta_turns" integer,
    "meta_validation_retries" integer,
    "meta_output_chars" integer,
    "meta_memory_chars" integer,
    "meta_parent_notes_chars" integer,
    "meta_learning_goal_chars" integer,
    "meta_success_def_chars" integer,
    "meta_prompt_chars" integer,
    "meta_tags_chars" integer,
    "meta_persona_chars" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "usage_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['game_create'::"text", 'game_edit'::"text", 'game_analysis'::"text", 'memory_update'::"text", 'voice_minutes'::"text"])))
);


ALTER TABLE "public"."usage_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."error_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    -- NULL for server errors caught outside a user context.
    "account_id" "uuid",
    "kid_id" "uuid",
    "game_id" "uuid",
    "type" "text" NOT NULL,
    "context" "text" NOT NULL,
    "provider" "text",
    "model" "text",
    "error_name" "text",
    "error_message" "text",
    "http_status" integer,
    "meta" "jsonb",
    "user_agent" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "error_logs_type_check" CHECK (("type" = ANY (ARRAY['client'::"text", 'server'::"text"])))
);


ALTER TABLE "public"."error_logs" OWNER TO "postgres";

COMMENT ON TABLE "public"."error_logs" IS 'Error telemetry, gated by ERROR_LOGS (all|client|server|none; unset ⇒ all). type=client: failures of browser-run flows (BYOK agent loops etc.) that never touch our servers, reported via /api/error-logs. type=server: errors caught in platform API routes. Sanitized client-side AND capped server-side: error name/message + operational meta only — never prompts, kid content, or provider keys.';


CREATE TABLE IF NOT EXISTS "public"."personas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid",
    "name" "text" NOT NULL,
    "soul" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_system_default" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."personas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."kids" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "social_id" "text" NOT NULL,
    "birthdate" "text",
    "avatar_config" "text",
    "active_persona_id" "uuid",
    "memory" "text",
    "date_preferences" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "parent_notes" "text"
);


ALTER TABLE "public"."kids" OWNER TO "postgres";

COMMENT ON COLUMN "public"."kids"."date_preferences" IS 'Plaintext per-kid date/time display override ({ dateStyle?, timeStyle?, timeZoneEnc? }); absent fields inherit the account default. An explicit timezone is sealed enc:v1: in timeZoneEnc.';


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kid_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "persona_id" "uuid",
    "event" "text" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."game_translations"
    ADD CONSTRAINT "game_translations_game_id_locale_key" UNIQUE ("game_id", "locale");


ALTER TABLE ONLY "public"."game_translations"
    ADD CONSTRAINT "game_translations_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."game_plays"
    ADD CONSTRAINT "game_plays_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_system_key_key" UNIQUE ("system_key");


ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personalities_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."kids"
    ADD CONSTRAINT "kids_name_tag_key" UNIQUE ("social_id");


ALTER TABLE ONLY "public"."kids"
    ADD CONSTRAINT "kids_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");


CREATE INDEX "game_plays_account_created_idx" ON "public"."game_plays" USING "btree" ("account_id", "created_at" DESC);


CREATE INDEX "game_plays_challenge_idx" ON "public"."game_plays" USING "btree" ("kid_id", "succeeded", "started_at" DESC);


CREATE INDEX "game_plays_game_idx" ON "public"."game_plays" USING "btree" ("game_id", "created_at" DESC);


CREATE INDEX "usage_events_account_created_idx" ON "public"."usage_events" USING "btree" ("account_id", "created_at" DESC);


CREATE INDEX "usage_events_account_kid_created_idx" ON "public"."usage_events" USING "btree" ("account_id", "kid_id", "created_at" DESC);


CREATE INDEX "error_logs_account_created_idx" ON "public"."error_logs" USING "btree" ("account_id", "created_at" DESC);


CREATE INDEX "error_logs_created_at_idx" ON "public"."error_logs" USING "btree" ("created_at" DESC);


CREATE INDEX "games_account_kid_created_idx" ON "public"."games" USING "btree" ("account_id", "kid_id", "created_at" DESC);


CREATE INDEX "games_system_created_idx" ON "public"."games" USING "btree" ("is_system", "created_at" DESC);


CREATE INDEX "games_tags_gin_idx" ON "public"."games" USING "gin" ("tags");


CREATE INDEX "game_versions_game_created_idx" ON "public"."game_versions" USING "btree" ("game_id", "created_at" DESC);


CREATE UNIQUE INDEX "game_sharings_game_kid_uniq" ON "public"."game_sharings" USING "btree" ("game_id", "kid_id") WHERE ("kid_id" IS NOT NULL);


CREATE UNIQUE INDEX "game_sharings_game_family_uniq" ON "public"."game_sharings" USING "btree" ("game_id") WHERE ("kid_id" IS NULL);


CREATE INDEX "game_sharings_game_idx" ON "public"."game_sharings" USING "btree" ("game_id");


CREATE INDEX "game_sharings_account_kid_idx" ON "public"."game_sharings" USING "btree" ("account_id", "kid_id");


CREATE INDEX "game_favorites_kid_idx" ON "public"."game_favorites" USING "btree" ("kid_id");


CREATE INDEX "personas_account_id_idx" ON "public"."personas" USING "btree" ("account_id");


CREATE UNIQUE INDEX "personas_one_system_default" ON "public"."personas" USING "btree" ("is_system_default") WHERE ("is_system_default" = true);


CREATE INDEX "kids_account_id_idx" ON "public"."kids" USING "btree" ("account_id");


CREATE INDEX "system_logs_account_id_idx" ON "public"."system_logs" USING "btree" ("account_id");


CREATE INDEX "system_logs_created_at_idx" ON "public"."system_logs" USING "btree" ("created_at" DESC);


CREATE INDEX "system_logs_kid_id_idx" ON "public"."system_logs" USING "btree" ("kid_id");


CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();


CREATE OR REPLACE TRIGGER "accounts_updated_at" BEFORE UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


CREATE OR REPLACE TRIGGER "game_plays_updated_at" BEFORE UPDATE ON "public"."game_plays" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


CREATE OR REPLACE TRIGGER "games_updated_at" BEFORE UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


CREATE OR REPLACE TRIGGER "personas_updated_at" BEFORE UPDATE ON "public"."personas" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


CREATE OR REPLACE TRIGGER "kids_updated_at" BEFORE UPDATE ON "public"."kids" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_plays"
    ADD CONSTRAINT "game_plays_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_plays"
    ADD CONSTRAINT "game_plays_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_plays"
    ADD CONSTRAINT "game_plays_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."usage_events"
    ADD CONSTRAINT "usage_events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_pkey" PRIMARY KEY ("id");


ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."error_logs"
    ADD CONSTRAINT "error_logs_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."game_sharings"
    ADD CONSTRAINT "game_sharings_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_sharings"
    ADD CONSTRAINT "game_sharings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_sharings"
    ADD CONSTRAINT "game_sharings_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_favorites"
    ADD CONSTRAINT "game_favorites_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_favorites"
    ADD CONSTRAINT "game_favorites_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_favorites"
    ADD CONSTRAINT "game_favorites_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_translations"
    ADD CONSTRAINT "game_translations_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_source_game_id_fkey" FOREIGN KEY ("source_game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_current_game_version_id_fkey" FOREIGN KEY ("current_game_version_id") REFERENCES "public"."game_versions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."game_versions"
    ADD CONSTRAINT "game_versions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_versions"
    ADD CONSTRAINT "game_versions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."game_versions"
    ADD CONSTRAINT "game_versions_previous_game_version_id_fkey" FOREIGN KEY ("previous_game_version_id") REFERENCES "public"."game_versions"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personalities_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."kids"
    ADD CONSTRAINT "kids_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."kids"
    ADD CONSTRAINT "kids_active_persona_id_fkey" FOREIGN KEY ("active_persona_id") REFERENCES "public"."personas"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;


ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE SET NULL;


ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE CASCADE;


CREATE POLICY "Users can create own game plays" ON "public"."game_plays" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can update own game plays" ON "public"."game_plays" FOR UPDATE USING (("auth"."uid"() = "account_id")) WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can view own game plays" ON "public"."game_plays" FOR SELECT USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can create own usage events" ON "public"."usage_events" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can view own usage events" ON "public"."usage_events" FOR SELECT USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can create own error logs" ON "public"."error_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can view own error logs" ON "public"."error_logs" FOR SELECT USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can create own game sharings" ON "public"."game_sharings" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can delete own game sharings" ON "public"."game_sharings" FOR DELETE USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can view own game sharings" ON "public"."game_sharings" FOR SELECT USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can create own game favorites" ON "public"."game_favorites" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can delete own game favorites" ON "public"."game_favorites" FOR DELETE USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can view own game favorites" ON "public"."game_favorites" FOR SELECT USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can create own custom games" ON "public"."games" FOR INSERT WITH CHECK ((("auth"."uid"() = "account_id") AND ("is_system" = false)));


CREATE POLICY "Users can create personas for own account" ON "public"."personas" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can create kids for own account" ON "public"."kids" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can delete own custom games" ON "public"."games" FOR DELETE USING ((("auth"."uid"() = "account_id") AND ("is_system" = false)));


CREATE POLICY "Users can delete own personas" ON "public"."personas" FOR DELETE USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can delete own kids" ON "public"."kids" FOR DELETE USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can insert own logs" ON "public"."system_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can update own account" ON "public"."accounts" FOR UPDATE USING (("auth"."uid"() = "id"));


CREATE POLICY "Users can update own custom games" ON "public"."games" FOR UPDATE USING ((("auth"."uid"() = "account_id") AND ("is_system" = false))) WITH CHECK ((("auth"."uid"() = "account_id") AND ("is_system" = false)));


CREATE POLICY "Users can view own game versions" ON "public"."game_versions" FOR SELECT USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can create own game versions" ON "public"."game_versions" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can update own game versions" ON "public"."game_versions" FOR UPDATE USING (("auth"."uid"() = "account_id")) WITH CHECK (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can update own personas" ON "public"."personas" FOR UPDATE USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can update own kids" ON "public"."kids" FOR UPDATE USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can view own account" ON "public"."accounts" FOR SELECT USING (("auth"."uid"() = "id"));


CREATE POLICY "Users can view own and global personas" ON "public"."personas" FOR SELECT USING ((("auth"."uid"() = "account_id") OR ("is_system_default" = true)));


CREATE POLICY "Users can view own and system games" ON "public"."games" FOR SELECT USING ((("is_system" = true) OR ("auth"."uid"() = "account_id")));


CREATE POLICY "Users can view own logs" ON "public"."system_logs" FOR SELECT USING (("auth"."uid"() = "account_id"));


CREATE POLICY "Users can view own kids" ON "public"."kids" FOR SELECT USING (("auth"."uid"() = "account_id"));


ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_plays" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."usage_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."error_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_sharings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_translations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "game_translations_delete" ON "public"."game_translations" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_translations"."game_id") AND ("g"."account_id" = "auth"."uid"())))));


CREATE POLICY "game_translations_insert" ON "public"."game_translations" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_translations"."game_id") AND ("g"."account_id" = "auth"."uid"())))));


CREATE POLICY "game_translations_select" ON "public"."game_translations" FOR SELECT USING (true);


CREATE POLICY "game_translations_update" ON "public"."game_translations" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."games" "g"
  WHERE (("g"."id" = "game_translations"."game_id") AND ("g"."account_id" = "auth"."uid"())))));


ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_versions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."personas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."kids" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."system_logs" ENABLE ROW LEVEL SECURITY;


ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";


GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


GRANT ALL ON TABLE "public"."accounts" TO "anon";
GRANT ALL ON TABLE "public"."accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."accounts" TO "service_role";


GRANT ALL ON TABLE "public"."game_plays" TO "anon";
GRANT ALL ON TABLE "public"."game_plays" TO "authenticated";
GRANT ALL ON TABLE "public"."game_plays" TO "service_role";


GRANT ALL ON TABLE "public"."usage_events" TO "anon";
GRANT ALL ON TABLE "public"."usage_events" TO "authenticated";
GRANT ALL ON TABLE "public"."usage_events" TO "service_role";


GRANT ALL ON TABLE "public"."error_logs" TO "anon";
GRANT ALL ON TABLE "public"."error_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."error_logs" TO "service_role";


GRANT ALL ON TABLE "public"."game_sharings" TO "anon";
GRANT ALL ON TABLE "public"."game_sharings" TO "authenticated";
GRANT ALL ON TABLE "public"."game_sharings" TO "service_role";


GRANT ALL ON TABLE "public"."game_favorites" TO "anon";
GRANT ALL ON TABLE "public"."game_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."game_favorites" TO "service_role";


GRANT ALL ON TABLE "public"."game_translations" TO "anon";
GRANT ALL ON TABLE "public"."game_translations" TO "authenticated";
GRANT ALL ON TABLE "public"."game_translations" TO "service_role";


GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";


GRANT ALL ON TABLE "public"."game_versions" TO "anon";
GRANT ALL ON TABLE "public"."game_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."game_versions" TO "service_role";


GRANT ALL ON TABLE "public"."personas" TO "anon";
GRANT ALL ON TABLE "public"."personas" TO "authenticated";
GRANT ALL ON TABLE "public"."personas" TO "service_role";


GRANT ALL ON TABLE "public"."kids" TO "anon";
GRANT ALL ON TABLE "public"."kids" TO "authenticated";
GRANT ALL ON TABLE "public"."kids" TO "service_role";


GRANT ALL ON TABLE "public"."system_logs" TO "anon";
GRANT ALL ON TABLE "public"."system_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."system_logs" TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


-- ---------------------------------------------------------------------------
-- devices: paired always-on companion devices (dodi-bot / agent).
-- Public keys only; the VMK wrap lives in accounts.vault_keys.deviceWraps.
-- Enroll/claim run via the service role (account_id is null until claimed).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "public"."devices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid",
    "device_id" "text" NOT NULL,
    "name" "text",
    "kem_public_key" "text" NOT NULL,
    "sign_public_key" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "pairing_code" "text",
    "enrolled_at" timestamp with time zone,
    "last_seen_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_account_device_uniq" UNIQUE ("account_id", "device_id");

ALTER TABLE ONLY "public"."devices"
    ADD CONSTRAINT "devices_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;

CREATE INDEX "devices_account_idx" ON "public"."devices" USING "btree" ("account_id");
CREATE INDEX "devices_pairing_code_idx" ON "public"."devices" USING "btree" ("pairing_code");

CREATE OR REPLACE TRIGGER "devices_updated_at" BEFORE UPDATE ON "public"."devices" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."devices" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own devices" ON "public"."devices" USING (("auth"."uid"() = "account_id")) WITH CHECK (("auth"."uid"() = "account_id"));

GRANT ALL ON TABLE "public"."devices" TO "anon";
GRANT ALL ON TABLE "public"."devices" TO "authenticated";
GRANT ALL ON TABLE "public"."devices" TO "service_role";


-- ---------------------------------------------------------------------------
-- friends: kid-to-kid social connections.
-- Per-kid friend identity keys live on kids: the public halves
-- (friend_kem_public_key / friend_sign_public_key) are plaintext so other kids
-- can seal to them; the secret halves are sealed under the account VMK in
-- friend_secret_keys (enc:v1:, opaque to the server). Friend "cards" (name,
-- birthdate, avatar) are sealed client-side to the recipient kid's KEM key
-- and stored on the friendship row as opaque blobs the server can never read —
-- it only gates *delivery* by status. Parent-controlled per-kid settings gate
-- who may add / be added and whether a parent's final approval is required.
-- See @dodi/protocol friend-card helpers.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."kids" ADD COLUMN IF NOT EXISTS "friend_kem_public_key" "text";
ALTER TABLE "public"."kids" ADD COLUMN IF NOT EXISTS "friend_sign_public_key" "text";
ALTER TABLE "public"."kids" ADD COLUMN IF NOT EXISTS "friend_secret_keys" "text";
ALTER TABLE "public"."kids" ADD COLUMN IF NOT EXISTS "can_add_friends" boolean DEFAULT false NOT NULL;
ALTER TABLE "public"."kids" ADD COLUMN IF NOT EXISTS "can_be_added_as_friend" boolean DEFAULT false NOT NULL;
ALTER TABLE "public"."kids" ADD COLUMN IF NOT EXISTS "incoming_friend_requests_require_parent_approval" boolean DEFAULT true NOT NULL;
ALTER TABLE "public"."kids" ADD COLUMN IF NOT EXISTS "outgoing_friend_requests_require_parent_approval" boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN "public"."kids"."friend_secret_keys" IS 'Opaque enc:v1: blob — the kid''s ML-KEM/ML-DSA secret keys sealed under the account VMK. Server cannot decrypt.';

-- ---------------------------------------------------------------------------
-- kids: avatar appearance + avatar-PIN puzzle.
-- ---------------------------------------------------------------------------
-- avatar_config holds the kid's chosen look { color, avatar } but is E2EE: the
-- client stores it as an enc:v1: JSON string (text, like the other sealed
-- fields), because the avatar choice can leak sensitive inferences (e.g.
-- gender). avatar_pin is
-- the optional secret 3-animal puzzle sequence, also sealed under the account
-- VMK (enc:v1:); NULL means the puzzle is disabled. Both are opaque to server.
ALTER TABLE "public"."kids" ADD COLUMN IF NOT EXISTS "avatar_pin" "text";

COMMENT ON COLUMN "public"."kids"."avatar_config" IS 'E2EE enc:v1: JSON string { color, avatar } — the kid''s chosen look, sealed under the account VMK. Server cannot decrypt.';
COMMENT ON COLUMN "public"."kids"."avatar_pin" IS 'E2EE enc:v1: JSON array of 3 avatar ids — the optional avatar-PIN puzzle. NULL = disabled. Server cannot decrypt.';

-- ---------------------------------------------------------------------------
-- kids: persisted "deaf" state for the Dodi voice companion.
-- NULL = Dodi listens normally. A timestamp means the kid deliberately muted
-- Dodi (deafened her); the client reads it on connect and comes up deaf
-- directly — never flashing into the active/listening state — until the kid
-- taps to wake her, which clears it back to NULL. Plaintext operational state
-- (not sensitive), server-visible so it round-trips through the kids API.
-- ---------------------------------------------------------------------------
ALTER TABLE "public"."kids" ADD COLUMN IF NOT EXISTS "deafened_dodi_at" timestamp with time zone;

COMMENT ON COLUMN "public"."kids"."deafened_dodi_at" IS 'Persisted Dodi deaf state: NULL = listens normally; a timestamp = kid muted Dodi, so she comes up deaf on connect until re-enabled. Plaintext operational state.';

CREATE TABLE IF NOT EXISTS "public"."friendships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requester_account_id" "uuid" NOT NULL,
    "requester_kid_id" "uuid" NOT NULL,
    "addressee_account_id" "uuid" NOT NULL,
    "addressee_kid_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "addressee_accepted" boolean DEFAULT false NOT NULL,
    "requester_parent_ok" boolean,
    "addressee_parent_ok" boolean,
    "blocked_by" "uuid",
    "requester_preview_card" "text",
    "requester_card" "text",
    "addressee_card" "text",
    "nickname" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "friendships_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'awaiting_parent'::"text", 'accepted'::"text", 'rejected'::"text", 'blocked'::"text"]))),
    CONSTRAINT "friendships_distinct_kids_check" CHECK (("requester_kid_id" <> "addressee_kid_id"))
);

ALTER TABLE "public"."friendships" OWNER TO "postgres";

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_account_id_fkey" FOREIGN KEY ("requester_account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_requester_kid_id_fkey" FOREIGN KEY ("requester_kid_id") REFERENCES "public"."kids"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_addressee_account_id_fkey" FOREIGN KEY ("addressee_account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_addressee_kid_id_fkey" FOREIGN KEY ("addressee_kid_id") REFERENCES "public"."kids"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."friendships"
    ADD CONSTRAINT "friendships_blocked_by_fkey" FOREIGN KEY ("blocked_by") REFERENCES "public"."kids"("id") ON DELETE SET NULL;

-- At most one live relationship per kid pair, regardless of direction.
CREATE UNIQUE INDEX "friendships_pair_uniq" ON "public"."friendships" USING "btree" (LEAST("requester_kid_id", "addressee_kid_id"), GREATEST("requester_kid_id", "addressee_kid_id")) WHERE ("status" = ANY (ARRAY['pending'::"text", 'awaiting_parent'::"text", 'accepted'::"text", 'blocked'::"text"]));
CREATE INDEX "friendships_addressee_idx" ON "public"."friendships" USING "btree" ("addressee_kid_id", "status");
CREATE INDEX "friendships_requester_idx" ON "public"."friendships" USING "btree" ("requester_kid_id", "status");

CREATE OR REPLACE TRIGGER "friendships_updated_at" BEFORE UPDATE ON "public"."friendships" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."friendships" ENABLE ROW LEVEL SECURITY;

-- Participants may READ their own friendship rows (defense-in-depth). All writes
-- go through the service-role (serviceClient) friends service, which enforces
-- scoping in app code — there is intentionally no INSERT/UPDATE/DELETE policy.
CREATE POLICY "Participants can view friendships" ON "public"."friendships" FOR SELECT USING ((("auth"."uid"() = "requester_account_id") OR ("auth"."uid"() = "addressee_account_id")));

GRANT ALL ON TABLE "public"."friendships" TO "anon";
GRANT ALL ON TABLE "public"."friendships" TO "authenticated";
GRANT ALL ON TABLE "public"."friendships" TO "service_role";


-- ===========================================================================
-- INVITE SYSTEM + REGISTRATION MODES
--
-- Admin-managed invite codes and a redemption ledger. Registration mode
-- (open/invite/closed) is enforced by the platform's before_user_created auth
-- hook; invite codes are validated there and RECORDED here by handle_new_user()
-- once the auth.users row (and account id) exists. RLS is enabled with no
-- policies (default-deny): only the service role and the SECURITY DEFINER
-- functions touch these tables. No client/admin UI — rows managed via SQL.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "public"."invite_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    -- null = unlimited uses while active (reserved for future per-code limits).
    "max_uses" integer,
    -- Free-text admin memo (who/why the code was issued).
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."invite_codes"
    ADD CONSTRAINT "invite_codes_pkey" PRIMARY KEY ("id");

-- Case-insensitive uniqueness so "DODI-BETA" and "dodi-beta" can't coexist.
CREATE UNIQUE INDEX IF NOT EXISTS "invite_codes_code_lower_uniq" ON "public"."invite_codes" USING "btree" ("lower"("code"));

CREATE TABLE IF NOT EXISTS "public"."invite_code_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "invite_code_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "redeemed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."invite_code_redemptions"
    ADD CONSTRAINT "invite_code_redemptions_pkey" PRIMARY KEY ("id");

-- One redemption row per (code, account) makes recording idempotent.
ALTER TABLE ONLY "public"."invite_code_redemptions"
    ADD CONSTRAINT "invite_code_redemptions_code_account_uniq" UNIQUE ("invite_code_id", "account_id");

ALTER TABLE ONLY "public"."invite_code_redemptions"
    ADD CONSTRAINT "invite_code_redemptions_invite_code_id_fkey" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."invite_code_redemptions"
    ADD CONSTRAINT "invite_code_redemptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS "invite_code_redemptions_account_idx" ON "public"."invite_code_redemptions" USING "btree" ("account_id");

CREATE OR REPLACE TRIGGER "invite_codes_updated_at" BEFORE UPDATE ON "public"."invite_codes" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."invite_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."invite_code_redemptions" ENABLE ROW LEVEL SECURITY;

-- redeem_invite_code(code, account_id): atomically record a redemption for an
-- active code. Returns true if recorded, false if no active code matches (or a
-- future max_uses limit is reached). Locks the code row so concurrent signups
-- against a max_uses-limited code can't over-redeem.
CREATE OR REPLACE FUNCTION "public"."redeem_invite_code"("p_code" "text", "p_account_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_invite public.invite_codes%rowtype;
  v_uses integer;
begin
  select * into v_invite
  from public.invite_codes
  where lower(code) = lower(btrim(p_code))
    and is_active = true
  for update;

  if not found then
    return false;
  end if;

  if v_invite.max_uses is not null then
    select count(*) into v_uses
    from public.invite_code_redemptions
    where invite_code_id = v_invite.id;

    if v_uses >= v_invite.max_uses then
      return false;
    end if;
  end if;

  insert into public.invite_code_redemptions (invite_code_id, account_id)
  values (v_invite.id, p_account_id)
  on conflict (invite_code_id, account_id) do nothing;

  return true;
end;
$$;

-- is_invite_code_active(code): read-only validity check used by the platform's
-- before_user_created hook (via the service role). A function (not a client
-- query) so the case-insensitive lower(code) match can't be turned into an
-- ILIKE wildcard by user input, and so clients can't probe codes directly.
CREATE OR REPLACE FUNCTION "public"."is_invite_code_active"("p_code" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  select exists (
    select 1
    from public.invite_codes
    where lower(code) = lower(btrim(p_code))
      and is_active = true
  );
$$;

-- These invite functions must never be callable directly by clients — only by
-- the service role and the SECURITY DEFINER trigger (which runs as owner). The
-- ALTER DEFAULT PRIVILEGES above grants EXECUTE to anon/authenticated, so
-- revoke it explicitly.
REVOKE ALL ON FUNCTION "public"."redeem_invite_code"("p_code" "text", "p_account_id" "uuid") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."redeem_invite_code"("p_code" "text", "p_account_id" "uuid") TO "service_role";
REVOKE ALL ON FUNCTION "public"."is_invite_code_active"("p_code" "text") FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."is_invite_code_active"("p_code" "text") TO "service_role";

GRANT ALL ON TABLE "public"."invite_codes" TO "anon";
GRANT ALL ON TABLE "public"."invite_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."invite_codes" TO "service_role";

GRANT ALL ON TABLE "public"."invite_code_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."invite_code_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."invite_code_redemptions" TO "service_role";


-- ===========================================================================
-- NEWSLETTER SIGNUPS
--
-- Emails captured by the static marketing site's forms (dodi.app) via the
-- public POST /api/newsletter endpoint. Each row belongs to a named `list`
-- (e.g. the marketing site's newsletter form binds to 'newsletter'); the set of
-- valid lists is configured in the app via the NEWSLETTER_LISTS env, not in the
-- schema. These are anonymous prospects with no account/vault, so this is
-- plaintext OPERATIONAL data (like invite_codes) — the E2EE rules don't apply.
-- RLS is enabled with no policies (default-deny): only the service role and the
-- SECURITY DEFINER function below touch these rows. Spam defense: unique
-- (list, lower(email)) for dedupe and a per-ip_hash rate limit enforced inside
-- record_newsletter_signup(). ip_hash is an HMAC of the IP (never the raw IP)
-- so we can throttle without storing PII.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "public"."newsletter_signups" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "email" "text" NOT NULL,
    "locale" "text" DEFAULT 'en'::"text" NOT NULL,
    -- Which newsletter/list this signup is for. Valid values are enforced in the
    -- app (NEWSLETTER_LISTS env), so no CHECK here — lists change without a migration.
    "list" "text" DEFAULT 'newsletter'::"text" NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    -- HMAC-SHA256(ip, pepper) — never the raw IP. Null when unknown.
    "ip_hash" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "newsletter_signups_locale_check" CHECK (("locale" = ANY (ARRAY['en'::"text", 'de'::"text"]))),
    CONSTRAINT "newsletter_signups_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'unsubscribed'::"text"])))
);

ALTER TABLE ONLY "public"."newsletter_signups"
    ADD CONSTRAINT "newsletter_signups_pkey" PRIMARY KEY ("id");

-- Dedupe per list, case-insensitive: one row per (list, email). Also the
-- ON CONFLICT target in record_newsletter_signup().
CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_signups_list_email_uniq" ON "public"."newsletter_signups" USING "btree" ("list", "lower"("email"));

-- Supports the per-IP rate-limit window count.
CREATE INDEX IF NOT EXISTS "newsletter_signups_ip_window_idx" ON "public"."newsletter_signups" USING "btree" ("ip_hash", "created_at");

CREATE OR REPLACE TRIGGER "newsletter_signups_updated_at" BEFORE UPDATE ON "public"."newsletter_signups" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."newsletter_signups" ENABLE ROW LEVEL SECURITY;

-- record_newsletter_signup(...): atomically enforce a per-ip_hash rate limit
-- (p_max_per_ip within p_window) and idempotently insert a signup. Returns one
-- row: (id, is_new, rate_limited). id is null when rate-limited; is_new is false
-- for a duplicate email (dedupe hit). Doing the count + insert in one function
-- avoids a check-then-insert race under concurrent submissions.
CREATE OR REPLACE FUNCTION "public"."record_newsletter_signup"("p_email" "text", "p_locale" "text", "p_list" "text", "p_ip_hash" "text", "p_max_per_ip" integer, "p_window" interval) RETURNS TABLE("id" "uuid", "is_new" boolean, "rate_limited" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_email  text := lower(btrim(p_email));
  v_locale text := coalesce(nullif(p_locale, ''), 'en');
  v_list   text := coalesce(nullif(p_list, ''), 'newsletter');
  v_count  integer;
  v_id     uuid;
begin
  -- Per-IP rate limit (only when we have a hash to key on).
  if p_ip_hash is not null then
    select count(*) into v_count
    from public.newsletter_signups w
    where w.ip_hash = p_ip_hash
      and w.created_at > now() - p_window;

    if v_count >= p_max_per_ip then
      return query select null::uuid, false, true;
      return;
    end if;
  end if;

  -- Idempotent insert; dedupe on (list, lower(email)).
  insert into public.newsletter_signups (email, locale, list, ip_hash)
  values (v_email, v_locale, v_list, p_ip_hash)
  on conflict (list, lower(email)) do nothing
  returning newsletter_signups.id into v_id;

  if v_id is not null then
    return query select v_id, true, false;
  else
    select w.id into v_id
    from public.newsletter_signups w
    where w.list = v_list
      and lower(w.email) = v_email
    limit 1;
    return query select v_id, false, false;
  end if;
end;
$$;

-- Only the service role may record signups; the public route calls it via
-- serviceClient(). The ALTER DEFAULT PRIVILEGES grants EXECUTE to
-- anon/authenticated, so revoke it explicitly (clients must never call directly).
REVOKE ALL ON FUNCTION "public"."record_newsletter_signup"("p_email" "text", "p_locale" "text", "p_list" "text", "p_ip_hash" "text", "p_max_per_ip" integer, "p_window" interval) FROM PUBLIC, "anon", "authenticated";
GRANT ALL ON FUNCTION "public"."record_newsletter_signup"("p_email" "text", "p_locale" "text", "p_list" "text", "p_ip_hash" "text", "p_max_per_ip" integer, "p_window" interval) TO "service_role";

GRANT ALL ON TABLE "public"."newsletter_signups" TO "anon";
GRANT ALL ON TABLE "public"."newsletter_signups" TO "authenticated";
GRANT ALL ON TABLE "public"."newsletter_signups" TO "service_role";


-- ===========================================================================
-- PLATFORM PLANS + CONFIG (BYOK entitlement catalogue)
--
-- platform_plans is the catalogue of subscribable plans. Each has a unique
-- `handle` (routing key + the value stored in accounts.subscribed_plan) plus the
-- entitlement columns that are COPIED onto an account when a plan is applied
-- (applyPlanToAccount) — so a single account's caps can be raised without adding
-- a new plan. platform_plan_translations holds localized titles (base row = en,
-- like game_translations). platform_config is a small server-side key/value store.
-- Catalogue rows are world-readable (SELECT true) with no user write policies
-- (seed/service-role only); platform_config has no policies (service-role only).
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "public"."platform_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "handle" "text" NOT NULL,
    "title" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "price_eur_month" numeric DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "max_kids" integer NOT NULL,
    "max_custom_personas" integer NOT NULL,
    "max_storage_mb_per_kid" integer NOT NULL,
    "memory_tier" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "platform_plans_memory_tier_check" CHECK (("memory_tier" = ANY (ARRAY['basic'::"text", 'advanced'::"text", 'full'::"text"])))
);

ALTER TABLE "public"."platform_plans" OWNER TO "postgres";

ALTER TABLE ONLY "public"."platform_plans"
    ADD CONSTRAINT "platform_plans_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."platform_plans"
    ADD CONSTRAINT "platform_plans_handle_key" UNIQUE ("handle");

CREATE TABLE IF NOT EXISTS "public"."platform_plan_translations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "plan_id" "uuid" NOT NULL,
    "locale" "text" NOT NULL,
    "title" "text" NOT NULL,
    "tagline" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."platform_plan_translations" OWNER TO "postgres";

ALTER TABLE ONLY "public"."platform_plan_translations"
    ADD CONSTRAINT "platform_plan_translations_pkey" PRIMARY KEY ("id");
ALTER TABLE ONLY "public"."platform_plan_translations"
    ADD CONSTRAINT "platform_plan_translations_plan_locale_key" UNIQUE ("plan_id", "locale");
ALTER TABLE ONLY "public"."platform_plan_translations"
    ADD CONSTRAINT "platform_plan_translations_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "public"."platform_plans"("id") ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS "public"."platform_config" (
    "key" "text" NOT NULL,
    "value" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."platform_config" OWNER TO "postgres";

ALTER TABLE ONLY "public"."platform_config"
    ADD CONSTRAINT "platform_config_pkey" PRIMARY KEY ("key");

-- accounts.subscribed_plan references a catalogue plan handle (added here since
-- platform_plans is created after the accounts table).
ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_subscribed_plan_fkey" FOREIGN KEY ("subscribed_plan") REFERENCES "public"."platform_plans"("handle") ON UPDATE CASCADE;

COMMENT ON COLUMN "public"."accounts"."subscribed_plan" IS 'Handle of the plan the account subscribed to (FK → platform_plans.handle). The plan''s entitlement columns (max_kids, …, memory_tier) are COPIED onto the account by applyPlanToAccount so per-account caps can be overridden without a new plan; enforcement always reads the account columns.';

CREATE INDEX "platform_plans_active_sort_idx" ON "public"."platform_plans" USING "btree" ("is_active", "sort_order");
CREATE INDEX "platform_plan_translations_plan_idx" ON "public"."platform_plan_translations" USING "btree" ("plan_id");

CREATE OR REPLACE TRIGGER "platform_plans_updated_at" BEFORE UPDATE ON "public"."platform_plans" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();
CREATE OR REPLACE TRIGGER "platform_plan_translations_updated_at" BEFORE UPDATE ON "public"."platform_plan_translations" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();
CREATE OR REPLACE TRIGGER "platform_config_updated_at" BEFORE UPDATE ON "public"."platform_config" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."platform_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_plan_translations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."platform_config" ENABLE ROW LEVEL SECURITY;

-- Catalogue is world-readable; no user write policies (seed/service-role only).
CREATE POLICY "platform_plans_select" ON "public"."platform_plans" FOR SELECT USING (true);
CREATE POLICY "platform_plan_translations_select" ON "public"."platform_plan_translations" FOR SELECT USING (true);
-- platform_config: no policies (default-deny); only the service role reads/writes.

GRANT ALL ON TABLE "public"."platform_plans" TO "anon";
GRANT ALL ON TABLE "public"."platform_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_plans" TO "service_role";
GRANT ALL ON TABLE "public"."platform_plan_translations" TO "anon";
GRANT ALL ON TABLE "public"."platform_plan_translations" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_plan_translations" TO "service_role";
GRANT ALL ON TABLE "public"."platform_config" TO "anon";
GRANT ALL ON TABLE "public"."platform_config" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_config" TO "service_role";

-- Seed: the BYOK plan catalogue (en title on the row; de in translations).
INSERT INTO "public"."platform_plans"
  ("handle", "title", "sort_order", "price_eur_month", "max_kids", "max_custom_personas", "max_storage_mb_per_kid", "memory_tier")
VALUES
  ('egg', 'Egg', 0, 0, 1, 2, 100, 'basic'),
  ('hatchling', 'Hatchling', 1, 9, 2, 4, 500, 'basic'),
  ('strider', 'Strider', 2, 19, 3, 6, 1024, 'advanced'),
  ('apex-dodi', 'Apex dodi', 3, 39, 9, 18, 5120, 'full')
ON CONFLICT ("handle") DO NOTHING;

INSERT INTO "public"."platform_plan_translations" ("plan_id", "locale", "title")
SELECT "p"."id", 'de', "t"."title"
FROM (VALUES
  ('egg', 'Ei'),
  ('hatchling', 'Küken'),
  ('strider', 'Wanderer'),
  ('apex-dodi', 'Spitzendodi')
) AS "t"("handle", "title")
JOIN "public"."platform_plans" "p" ON "p"."handle" = "t"."handle"
ON CONFLICT ("plan_id", "locale") DO NOTHING;

INSERT INTO "public"."platform_config" ("key", "value")
VALUES ('default_plan_handle', '"egg"'::"jsonb")
ON CONFLICT ("key") DO NOTHING;


-- ===========================================================================
-- GAME SNAPSHOTS (E2EE)
--
-- Self-contained saved game moments ("snapshots"): each row carries TWO opaque
-- sealed blobs — info_enc (light: title, game title, thumbnail; decrypted to
-- render the collection) and payload_enc (heavy: full game code + metadata +
-- restorable save state, so a snapshot outlives game edits/deletion and plays
-- on a friend's device that never had the game). Own snapshots are sealed
-- enc:v1: under the account VMK; received snapshots are SealedEnvelope JSON
-- sealed to the recipient kid's friend KEM key and signed by the sender kid
-- (friend-card pattern). The server can never read either blob — it only
-- stores them and gates delivery. See @dodi/protocol snapshot helpers.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS "public"."game_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kid_id" "uuid" NOT NULL,
    "game_id" "uuid",
    "origin" "text" DEFAULT 'own'::"text" NOT NULL,
    "sender_kid_id" "uuid",
    "friendship_id" "uuid",
    "shared_with_kid_id" "uuid",
    "info_enc" "text" NOT NULL,
    "payload_enc" "text" NOT NULL,
    "payload_bytes" integer DEFAULT 0 NOT NULL,
    "viewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_snapshots_origin_check" CHECK (("origin" = ANY (ARRAY['own'::"text", 'received'::"text", 'autosave'::"text"]))),
    CONSTRAINT "game_snapshots_received_sender_check" CHECK ((("origin" <> 'received'::"text") OR ("sender_kid_id" IS NOT NULL))),
    CONSTRAINT "game_snapshots_payload_bytes_check" CHECK (("payload_bytes" >= 0))
);

ALTER TABLE "public"."game_snapshots" OWNER TO "postgres";

ALTER TABLE ONLY "public"."game_snapshots"
    ADD CONSTRAINT "game_snapshots_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."game_snapshots"
    ADD CONSTRAINT "game_snapshots_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;
ALTER TABLE ONLY "public"."game_snapshots"
    ADD CONSTRAINT "game_snapshots_kid_id_fkey" FOREIGN KEY ("kid_id") REFERENCES "public"."kids"("id") ON DELETE CASCADE;
-- Soft reference: snapshots are self-contained and survive game deletion.
ALTER TABLE ONLY "public"."game_snapshots"
    ADD CONSTRAINT "game_snapshots_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."game_snapshots"
    ADD CONSTRAINT "game_snapshots_sender_kid_id_fkey" FOREIGN KEY ("sender_kid_id") REFERENCES "public"."kids"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."game_snapshots"
    ADD CONSTRAINT "game_snapshots_friendship_id_fkey" FOREIGN KEY ("friendship_id") REFERENCES "public"."friendships"("id") ON DELETE SET NULL;
ALTER TABLE ONLY "public"."game_snapshots"
    ADD CONSTRAINT "game_snapshots_shared_with_kid_id_fkey" FOREIGN KEY ("shared_with_kid_id") REFERENCES "public"."kids"("id") ON DELETE SET NULL;

CREATE INDEX "game_snapshots_kid_created_idx" ON "public"."game_snapshots" USING "btree" ("kid_id", "created_at" DESC);
CREATE INDEX "game_snapshots_account_created_idx" ON "public"."game_snapshots" USING "btree" ("account_id", "created_at" DESC);
-- One autosave slot per kid and game; the service overwrites it in place.
CREATE UNIQUE INDEX "game_snapshots_autosave_unique_idx" ON "public"."game_snapshots" USING "btree" ("kid_id", "game_id") WHERE ("origin" = 'autosave'::"text");

CREATE OR REPLACE TRIGGER "game_snapshots_updated_at" BEFORE UPDATE ON "public"."game_snapshots" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();

ALTER TABLE "public"."game_snapshots" ENABLE ROW LEVEL SECURITY;

-- Owners manage their own rows (UPDATE exists for viewed_at marking). Received
-- rows (origin='received') are inserted ONLY by the service-role snapshots
-- service after validating an accepted friendship between the sender and the
-- recipient kid — there is intentionally no user INSERT policy for them.
CREATE POLICY "Users can view own game snapshots" ON "public"."game_snapshots" FOR SELECT USING (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can create own game snapshots" ON "public"."game_snapshots" FOR INSERT WITH CHECK ((("auth"."uid"() = "account_id") AND ("origin" = ANY (ARRAY['own'::"text", 'autosave'::"text"]))));
CREATE POLICY "Users can update own game snapshots" ON "public"."game_snapshots" FOR UPDATE USING (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can delete own game snapshots" ON "public"."game_snapshots" FOR DELETE USING (("auth"."uid"() = "account_id"));

GRANT ALL ON TABLE "public"."game_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."game_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."game_snapshots" TO "service_role";

COMMENT ON COLUMN "public"."game_snapshots"."info_enc" IS 'Opaque light gallery blob (title, game title, thumbnail). origin=own: enc:v1: JSON under the account VMK; origin=received: SealedEnvelope JSON to the kid''s friend KEM key, signed by the sender kid. Server cannot decrypt.';
COMMENT ON COLUMN "public"."game_snapshots"."payload_enc" IS 'Opaque heavy blob (game code + metadata + restorable save state), sealed like info_enc. Self-contained: outlives game edits/deletion. Server cannot decrypt.';
COMMENT ON COLUMN "public"."game_snapshots"."payload_bytes" IS 'Approximate plaintext payload size in bytes — recorded for future per-kid storage quota enforcement.';
COMMENT ON COLUMN "public"."game_snapshots"."game_id" IS 'Soft reference to the source game (the sender''s game for received snapshots); NULL only after game deletion.';
COMMENT ON COLUMN "public"."game_snapshots"."origin" IS 'own = manually saved by this kid; received = delivered by a friend; autosave = the kid''s single resume slot per game (hidden from the collection, overwritten in place).';
COMMENT ON COLUMN "public"."game_snapshots"."shared_with_kid_id" IS 'Sender-side "sent" marker on own rows: the friend kid this snapshot was delivered to when it was created by sharing (share implies save). NULL for plain saves; set NULL if the friend kid is deleted.';
