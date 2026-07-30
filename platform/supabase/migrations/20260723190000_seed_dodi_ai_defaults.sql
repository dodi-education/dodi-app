-- Seed the dodi AI defaults row in platform_config (a KEY/VALUE table — this
-- is one row, not columns). It holds the per-category model recommendation
-- that the "default" model sentinel in accounts.model_config resolves against
-- at call time: editing this row upgrades every non-customized dodi AI account
-- instantly — no code deploy, no per-user migration.
--
-- provider must be a real (non-"dodi") id from the @dodi/ai registry and model
-- one of the curated dodi AI catalog ids ("voice" applies to the voice
-- category only). Example update:
--
--   UPDATE "public"."platform_config"
--     SET "value" = jsonb_set("value", '{game,model}', '"grok-4.5"'), "updated_at" = now()
--     WHERE "key" = 'dodi_ai_defaults';
--
-- The table stays default-deny (service-role only); authed parents read this
-- row via GET /api/ai/defaults (it holds no secrets).

-- forward:

INSERT INTO "public"."platform_config" ("key", "value") VALUES
  ('dodi_ai_defaults', '{
    "voice":    { "provider": "xai", "model": "grok-voice-latest", "voice": "ara" },
    "thinking": { "provider": "xai", "model": "grok-4-fast-reasoning" },
    "game":     { "provider": "xai", "model": "grok-4.5" },
    "image":    { "provider": "xai", "model": "grok-imagine-image" }
  }'::jsonb)
ON CONFLICT ("key") DO NOTHING;

-- reverse:
-- DELETE FROM "public"."platform_config" WHERE "key" = 'dodi_ai_defaults';
