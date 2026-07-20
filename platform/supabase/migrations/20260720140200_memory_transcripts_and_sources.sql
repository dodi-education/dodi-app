-- Structured memory + day-batched transcripts (E2EE content in *_enc columns).
-- kids.memory remains the AI briefing dossier (derived, still E2EE).
-- Activities table is unrelated — no memory lifecycle rows there.

-- forward:

CREATE TABLE IF NOT EXISTS "public"."transcripts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kid_id" "uuid" NOT NULL,
    "local_date" "date" NOT NULL,
    "persona_id" "uuid",
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "content_enc" "text",
    "processed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transcripts_kid_local_date_key" UNIQUE ("kid_id", "local_date"),
    CONSTRAINT "transcripts_status_check" CHECK (
      ("status" = ANY (ARRAY['open'::"text", 'processed'::"text"]))
    ),
    CONSTRAINT "transcripts_account_id_fkey" FOREIGN KEY ("account_id")
      REFERENCES "public"."accounts"("id") ON DELETE CASCADE,
    CONSTRAINT "transcripts_kid_id_fkey" FOREIGN KEY ("kid_id")
      REFERENCES "public"."kids"("id") ON DELETE CASCADE,
    CONSTRAINT "transcripts_persona_id_fkey" FOREIGN KEY ("persona_id")
      REFERENCES "public"."personas"("id") ON DELETE SET NULL
);

CREATE INDEX "transcripts_account_kid_date_idx"
  ON "public"."transcripts" USING "btree" ("account_id", "kid_id", "local_date" DESC);
CREATE INDEX "transcripts_kid_status_idx"
  ON "public"."transcripts" USING "btree" ("kid_id", "status");

CREATE TABLE IF NOT EXISTS "public"."transcript_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "transcript_id" "uuid" NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kid_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "content_enc" "text" NOT NULL,
    "occurred_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "transcript_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "transcript_entries_role_check" CHECK (
      ("role" = ANY (ARRAY['dodi'::"text", 'kid'::"text"]))
    ),
    CONSTRAINT "transcript_entries_transcript_id_fkey" FOREIGN KEY ("transcript_id")
      REFERENCES "public"."transcripts"("id") ON DELETE CASCADE,
    CONSTRAINT "transcript_entries_account_id_fkey" FOREIGN KEY ("account_id")
      REFERENCES "public"."accounts"("id") ON DELETE CASCADE,
    CONSTRAINT "transcript_entries_kid_id_fkey" FOREIGN KEY ("kid_id")
      REFERENCES "public"."kids"("id") ON DELETE CASCADE
);

CREATE INDEX "transcript_entries_transcript_id_idx"
  ON "public"."transcript_entries" USING "btree" ("transcript_id", "occurred_at");
CREATE INDEX "transcript_entries_kid_id_idx"
  ON "public"."transcript_entries" USING "btree" ("kid_id", "occurred_at");

-- memories first without discard_memory_source_id FK (added after memory_sources)
CREATE TABLE IF NOT EXISTS "public"."memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "account_id" "uuid" NOT NULL,
    "kid_id" "uuid" NOT NULL,
    "content_enc" "text" NOT NULL,
    "category" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "discarded_at" timestamp with time zone,
    "discarded_by" "text",
    "discard_memory_source_id" "uuid",
    CONSTRAINT "memories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memories_status_check" CHECK (
      ("status" = ANY (ARRAY['active'::"text", 'discarded'::"text"]))
    ),
    CONSTRAINT "memories_discarded_by_check" CHECK (
      ("discarded_by" IS NULL)
      OR ("discarded_by" = ANY (ARRAY['system'::"text", 'parent'::"text"]))
    ),
    CONSTRAINT "memories_active_nulls_check" CHECK (
      (
        ("status" = 'active'::"text")
        AND ("discarded_at" IS NULL)
        AND ("discarded_by" IS NULL)
        AND ("discard_memory_source_id" IS NULL)
      )
      OR (
        ("status" = 'discarded'::"text")
        AND ("discarded_at" IS NOT NULL)
        AND ("discarded_by" IS NOT NULL)
        AND (
          ("discarded_by" = 'parent'::"text")
          OR (
            ("discarded_by" = 'system'::"text")
            AND ("discard_memory_source_id" IS NOT NULL)
          )
        )
      )
    ),
    CONSTRAINT "memories_account_id_fkey" FOREIGN KEY ("account_id")
      REFERENCES "public"."accounts"("id") ON DELETE CASCADE,
    CONSTRAINT "memories_kid_id_fkey" FOREIGN KEY ("kid_id")
      REFERENCES "public"."kids"("id") ON DELETE CASCADE
);

CREATE INDEX "memories_kid_status_idx"
  ON "public"."memories" USING "btree" ("kid_id", "status");
CREATE INDEX "memories_account_kid_created_idx"
  ON "public"."memories" USING "btree" ("account_id", "kid_id", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "public"."memory_sources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "memory_id" "uuid" NOT NULL,
    "transcript_entry_id" "uuid" NOT NULL,
    "relation" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "memory_sources_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "memory_sources_relation_check" CHECK (
      ("relation" = ANY (ARRAY['supports'::"text", 'contradicts'::"text"]))
    ),
    CONSTRAINT "memory_sources_memory_entry_relation_key"
      UNIQUE ("memory_id", "transcript_entry_id", "relation"),
    CONSTRAINT "memory_sources_memory_id_fkey" FOREIGN KEY ("memory_id")
      REFERENCES "public"."memories"("id") ON DELETE CASCADE,
    CONSTRAINT "memory_sources_transcript_entry_id_fkey" FOREIGN KEY ("transcript_entry_id")
      REFERENCES "public"."transcript_entries"("id") ON DELETE RESTRICT
);

CREATE INDEX "memory_sources_memory_id_idx"
  ON "public"."memory_sources" USING "btree" ("memory_id");
CREATE INDEX "memory_sources_transcript_entry_id_idx"
  ON "public"."memory_sources" USING "btree" ("transcript_entry_id");

ALTER TABLE "public"."memories"
  ADD CONSTRAINT "memories_discard_memory_source_id_fkey"
  FOREIGN KEY ("discard_memory_source_id")
  REFERENCES "public"."memory_sources"("id") ON DELETE SET NULL;

ALTER TABLE "public"."transcripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transcript_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."memory_sources" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transcripts"
  ON "public"."transcripts" FOR SELECT
  USING (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can insert own transcripts"
  ON "public"."transcripts" FOR INSERT
  WITH CHECK (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can update own transcripts"
  ON "public"."transcripts" FOR UPDATE
  USING (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can delete own transcripts"
  ON "public"."transcripts" FOR DELETE
  USING (("auth"."uid"() = "account_id"));

CREATE POLICY "Users can view own transcript entries"
  ON "public"."transcript_entries" FOR SELECT
  USING (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can insert own transcript entries"
  ON "public"."transcript_entries" FOR INSERT
  WITH CHECK (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can update own transcript entries"
  ON "public"."transcript_entries" FOR UPDATE
  USING (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can delete own transcript entries"
  ON "public"."transcript_entries" FOR DELETE
  USING (("auth"."uid"() = "account_id"));

CREATE POLICY "Users can view own memories"
  ON "public"."memories" FOR SELECT
  USING (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can insert own memories"
  ON "public"."memories" FOR INSERT
  WITH CHECK (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can update own memories"
  ON "public"."memories" FOR UPDATE
  USING (("auth"."uid"() = "account_id"));
CREATE POLICY "Users can delete own memories"
  ON "public"."memories" FOR DELETE
  USING (("auth"."uid"() = "account_id"));

-- memory_sources has no account_id; scope via memory ownership
CREATE POLICY "Users can view own memory sources"
  ON "public"."memory_sources" FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM "public"."memories" m
      WHERE m.id = memory_id AND m.account_id = "auth"."uid"()
    )
  );
CREATE POLICY "Users can insert own memory sources"
  ON "public"."memory_sources" FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "public"."memories" m
      WHERE m.id = memory_id AND m.account_id = "auth"."uid"()
    )
  );
CREATE POLICY "Users can update own memory sources"
  ON "public"."memory_sources" FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM "public"."memories" m
      WHERE m.id = memory_id AND m.account_id = "auth"."uid"()
    )
  );
CREATE POLICY "Users can delete own memory sources"
  ON "public"."memory_sources" FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM "public"."memories" m
      WHERE m.id = memory_id AND m.account_id = "auth"."uid"()
    )
  );

GRANT ALL ON TABLE "public"."transcripts" TO "anon";
GRANT ALL ON TABLE "public"."transcripts" TO "authenticated";
GRANT ALL ON TABLE "public"."transcripts" TO "service_role";
GRANT ALL ON TABLE "public"."transcript_entries" TO "anon";
GRANT ALL ON TABLE "public"."transcript_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."transcript_entries" TO "service_role";
GRANT ALL ON TABLE "public"."memories" TO "anon";
GRANT ALL ON TABLE "public"."memories" TO "authenticated";
GRANT ALL ON TABLE "public"."memories" TO "service_role";
GRANT ALL ON TABLE "public"."memory_sources" TO "anon";
GRANT ALL ON TABLE "public"."memory_sources" TO "authenticated";
GRANT ALL ON TABLE "public"."memory_sources" TO "service_role";

COMMENT ON TABLE "public"."transcripts" IS 'Day-batched conversation container per kid (local calendar date). Entry content is E2EE.';
COMMENT ON COLUMN "public"."transcripts"."content_enc" IS 'E2EE JSON mirror of all day entries (ids + text); one-decrypt read path for memory processing.';
COMMENT ON TABLE "public"."transcript_entries" IS 'Encrypted turn content (role dodi|kid), ordered by occurred_at. Cited by memory_sources.';
COMMENT ON TABLE "public"."memories" IS 'Structured kid memory observations (E2EE content). Lifecycle: active|discarded.';
COMMENT ON TABLE "public"."memory_sources" IS 'n:m memory ↔ transcript_entry with relation supports|contradicts.';
COMMENT ON COLUMN "public"."kids"."memory" IS 'E2EE AI briefing dossier markdown; derived from active memories with [source:memory_source_id] citations.';

-- reverse:
-- DROP TABLE IF EXISTS "public"."memory_sources";
-- DROP TABLE IF EXISTS "public"."memories";
-- DROP TABLE IF EXISTS "public"."transcript_entries";
-- DROP TABLE IF EXISTS "public"."transcripts";
