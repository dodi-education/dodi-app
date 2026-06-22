


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






CREATE TYPE "public"."subscription_tier" AS ENUM (
    'free',
    'premium'
);


ALTER TYPE "public"."subscription_tier" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.accounts (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

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
    "subscription_tier" "public"."subscription_tier" DEFAULT 'free'::"public"."subscription_tier" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vault_keys" "jsonb"
);


ALTER TABLE "public"."accounts" OWNER TO "postgres";


COMMENT ON COLUMN "public"."accounts"."vault_keys" IS 'Opaque wrapped Vault Master Key material (StoredVaultKeys). Server cannot decrypt it. See src/lib/vault.';



CREATE TABLE IF NOT EXISTS "public"."agent_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "task_type" "text" NOT NULL,
    "task_prompt" "text" DEFAULT ''::"text" NOT NULL,
    "dodi_context" "text" DEFAULT 'game_creation'::"text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "progress" "text" DEFAULT 'planning'::"text" NOT NULL,
    "result" "jsonb",
    "error" "text",
    "game_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "finished_at" timestamp with time zone,
    "deactivated_at" timestamp with time zone,
    CONSTRAINT "agent_sessions_progress_check" CHECK (("progress" = ANY (ARRAY['planning'::"text", 'building'::"text", 'testing'::"text", 'done'::"text"]))),
    CONSTRAINT "agent_sessions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'failed'::"text", 'deactivated'::"text"]))),
    CONSTRAINT "agent_sessions_task_type_check" CHECK (("task_type" = ANY (ARRAY['generate_game'::"text", 'update_game'::"text"])))
);


ALTER TABLE "public"."agent_sessions" OWNER TO "postgres";


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
    "profile_id" "uuid",
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
    CONSTRAINT "games_age_range_check" CHECK (("target_age_min" <= "target_age_max")),
    CONSTRAINT "games_created_by_check" CHECK (("created_by" = ANY (ARRAY['system'::"text", 'parent'::"text", 'kid'::"text"]))),
    CONSTRAINT "games_duration_check" CHECK ((("estimated_duration_minutes" >= 1) AND ("estimated_duration_minutes" <= 180))),
    CONSTRAINT "games_progress_kind_check" CHECK (("progress_kind" = ANY (ARRAY['goal'::"text", 'open'::"text"]))),
    CONSTRAINT "games_system_row_check" CHECK (((("is_system" = true) AND ("account_id" IS NULL) AND ("profile_id" IS NULL) AND ("system_key" IS NOT NULL)) OR (("is_system" = false) AND ("account_id" IS NOT NULL) AND ("system_key" IS NULL))))
);


ALTER TABLE "public"."games" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_sharings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "game_sharings_pkey" PRIMARY KEY ("id")
);


ALTER TABLE "public"."game_sharings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."game_plays" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "profile_id" "uuid" NOT NULL,
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


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "social_id" "text" NOT NULL,
    "birthdate" "text",
    "avatar_config" "jsonb",
    "active_persona_id" "uuid",
    "memory" "text",
    "preferences" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "language" "text" DEFAULT 'en'::"text" NOT NULL,
    "first_interaction" boolean DEFAULT false NOT NULL,
    "parent_notes" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."system_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "profile_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "persona_id" "uuid",
    "event" "text" NOT NULL,
    "message" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."system_logs" OWNER TO "postgres";


ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."agent_sessions"
    ADD CONSTRAINT "agent_sessions_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_name_tag_key" UNIQUE ("social_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id");



CREATE INDEX "agent_sessions_account_created_idx" ON "public"."agent_sessions" USING "btree" ("account_id", "created_at" DESC);



CREATE INDEX "agent_sessions_profile_status_idx" ON "public"."agent_sessions" USING "btree" ("profile_id", "status", "created_at" DESC);



CREATE INDEX "game_plays_account_created_idx" ON "public"."game_plays" USING "btree" ("account_id", "created_at" DESC);



CREATE INDEX "game_plays_challenge_idx" ON "public"."game_plays" USING "btree" ("profile_id", "succeeded", "started_at" DESC);



CREATE INDEX "game_plays_game_idx" ON "public"."game_plays" USING "btree" ("game_id", "created_at" DESC);



CREATE INDEX "games_account_profile_created_idx" ON "public"."games" USING "btree" ("account_id", "profile_id", "created_at" DESC);



CREATE INDEX "games_system_created_idx" ON "public"."games" USING "btree" ("is_system", "created_at" DESC);



CREATE INDEX "games_tags_gin_idx" ON "public"."games" USING "gin" ("tags");



CREATE UNIQUE INDEX "game_sharings_game_profile_uniq" ON "public"."game_sharings" USING "btree" ("game_id", "profile_id") WHERE ("profile_id" IS NOT NULL);



CREATE UNIQUE INDEX "game_sharings_game_family_uniq" ON "public"."game_sharings" USING "btree" ("game_id") WHERE ("profile_id" IS NULL);



CREATE INDEX "game_sharings_game_idx" ON "public"."game_sharings" USING "btree" ("game_id");



CREATE INDEX "game_sharings_account_profile_idx" ON "public"."game_sharings" USING "btree" ("account_id", "profile_id");



CREATE INDEX "personas_account_id_idx" ON "public"."personas" USING "btree" ("account_id");



CREATE UNIQUE INDEX "personas_one_system_default" ON "public"."personas" USING "btree" ("is_system_default") WHERE ("is_system_default" = true);



CREATE INDEX "profiles_account_id_idx" ON "public"."profiles" USING "btree" ("account_id");



CREATE INDEX "system_logs_account_id_idx" ON "public"."system_logs" USING "btree" ("account_id");



CREATE INDEX "system_logs_created_at_idx" ON "public"."system_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "system_logs_profile_id_idx" ON "public"."system_logs" USING "btree" ("profile_id");



CREATE OR REPLACE TRIGGER "on_auth_user_created" AFTER INSERT ON "auth"."users" FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_user"();



CREATE OR REPLACE TRIGGER "accounts_updated_at" BEFORE UPDATE ON "public"."accounts" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "agent_sessions_updated_at" BEFORE UPDATE ON "public"."agent_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "game_plays_updated_at" BEFORE UPDATE ON "public"."game_plays" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "games_updated_at" BEFORE UPDATE ON "public"."games" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "personas_updated_at" BEFORE UPDATE ON "public"."personas" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."accounts"
    ADD CONSTRAINT "accounts_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_sessions"
    ADD CONSTRAINT "agent_sessions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."agent_sessions"
    ADD CONSTRAINT "agent_sessions_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."agent_sessions"
    ADD CONSTRAINT "agent_sessions_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_plays"
    ADD CONSTRAINT "game_plays_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_plays"
    ADD CONSTRAINT "game_plays_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_plays"
    ADD CONSTRAINT "game_plays_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_sharings"
    ADD CONSTRAINT "game_sharings_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_sharings"
    ADD CONSTRAINT "game_sharings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_sharings"
    ADD CONSTRAINT "game_sharings_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."game_translations"
    ADD CONSTRAINT "game_translations_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_source_game_id_fkey" FOREIGN KEY ("source_game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."personas"
    ADD CONSTRAINT "personalities_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_active_persona_id_fkey" FOREIGN KEY ("active_persona_id") REFERENCES "public"."personas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "public"."personas"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."system_logs"
    ADD CONSTRAINT "system_logs_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



CREATE POLICY "Users can create own agent sessions" ON "public"."agent_sessions" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can create own game plays" ON "public"."game_plays" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can update own game plays" ON "public"."game_plays" FOR UPDATE USING (("auth"."uid"() = "account_id")) WITH CHECK (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can view own game plays" ON "public"."game_plays" FOR SELECT USING (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can create own game sharings" ON "public"."game_sharings" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can delete own game sharings" ON "public"."game_sharings" FOR DELETE USING (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can view own game sharings" ON "public"."game_sharings" FOR SELECT USING (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can create own custom games" ON "public"."games" FOR INSERT WITH CHECK ((("auth"."uid"() = "account_id") AND ("is_system" = false)));



CREATE POLICY "Users can create personas for own account" ON "public"."personas" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can create profiles for own account" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can delete own custom games" ON "public"."games" FOR DELETE USING ((("auth"."uid"() = "account_id") AND ("is_system" = false)));



CREATE POLICY "Users can delete own personas" ON "public"."personas" FOR DELETE USING (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can delete own profiles" ON "public"."profiles" FOR DELETE USING (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can insert own logs" ON "public"."system_logs" FOR INSERT WITH CHECK (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can update own account" ON "public"."accounts" FOR UPDATE USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own agent sessions" ON "public"."agent_sessions" FOR UPDATE USING (("auth"."uid"() = "account_id")) WITH CHECK (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can update own custom games" ON "public"."games" FOR UPDATE USING ((("auth"."uid"() = "account_id") AND ("is_system" = false))) WITH CHECK ((("auth"."uid"() = "account_id") AND ("is_system" = false)));



CREATE POLICY "Users can update own personas" ON "public"."personas" FOR UPDATE USING (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can update own profiles" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can view own account" ON "public"."accounts" FOR SELECT USING (("auth"."uid"() = "id"));



CREATE POLICY "Users can view own agent sessions" ON "public"."agent_sessions" FOR SELECT USING (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can view own and global personas" ON "public"."personas" FOR SELECT USING ((("auth"."uid"() = "account_id") OR ("is_system_default" = true)));



CREATE POLICY "Users can view own and system games" ON "public"."games" FOR SELECT USING ((("is_system" = true) OR ("auth"."uid"() = "account_id")));



CREATE POLICY "Users can view own logs" ON "public"."system_logs" FOR SELECT USING (("auth"."uid"() = "account_id"));



CREATE POLICY "Users can view own profiles" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() = "account_id"));



ALTER TABLE "public"."accounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."agent_sessions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_plays" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."game_sharings" ENABLE ROW LEVEL SECURITY;


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


ALTER TABLE "public"."personas" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


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



GRANT ALL ON TABLE "public"."agent_sessions" TO "anon";
GRANT ALL ON TABLE "public"."agent_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."agent_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."game_plays" TO "anon";
GRANT ALL ON TABLE "public"."game_plays" TO "authenticated";
GRANT ALL ON TABLE "public"."game_plays" TO "service_role";



GRANT ALL ON TABLE "public"."game_sharings" TO "anon";
GRANT ALL ON TABLE "public"."game_sharings" TO "authenticated";
GRANT ALL ON TABLE "public"."game_sharings" TO "service_role";



GRANT ALL ON TABLE "public"."game_translations" TO "anon";
GRANT ALL ON TABLE "public"."game_translations" TO "authenticated";
GRANT ALL ON TABLE "public"."game_translations" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON TABLE "public"."personas" TO "anon";
GRANT ALL ON TABLE "public"."personas" TO "authenticated";
GRANT ALL ON TABLE "public"."personas" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



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



































