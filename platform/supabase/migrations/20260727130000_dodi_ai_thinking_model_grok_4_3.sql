-- The dodi AI thinking default was `grok-4-fast-reasoning` — an id the xAI
-- pricing API does not serve (neither a model id nor an alias), so the
-- commercial price pipeline could never publish thinking prices, and live
-- usage for it bills under the canonical "API grok-4.3" anyway. Switch the
-- default to grok-4.3 (same price tier, reasoning-capable, alias grok-latest).
--
-- SYNC TOUCHPOINT: dodi-com `ops_config.service_models` changes in lockstep
-- (dodi-com migration 20260727130000_service_models_thinking_grok_4_3.sql).

-- forward:

UPDATE "public"."platform_config"
    SET "value" = jsonb_set("value", '{thinking,model}', '"grok-4.3"'),
        "updated_at" = now()
    WHERE "key" = 'dodi_ai_defaults';

-- reverse:
-- UPDATE "public"."platform_config"
--     SET "value" = jsonb_set("value", '{thinking,model}', '"grok-4-fast-reasoning"'),
--         "updated_at" = now()
--     WHERE "key" = 'dodi_ai_defaults';
