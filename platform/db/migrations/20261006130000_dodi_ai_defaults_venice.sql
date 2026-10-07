-- dodi AI defaults move text and image to Venice; voice stays on xAI native.
--
-- Venice model ids are its own (hyphenated: grok-4-3, not xAI's grok-4.3).
-- Clients resolve the "default" sentinel against this row, and a stored
-- explicit pick that isn't in the new provider's catalog falls back to it
-- (core/client-state resolve-execution.ts).
--
-- SYNC TOUCHPOINT: mirrors dodi-com ops_config.service_models (provider +
-- model per service). Apply this only after ai.dodi.app serves Venice keys
-- and the clients that can drive them are deployed.

UPDATE public.platform_config
SET value = '{"game": {"model": "claude-opus-5-5", "provider": "venice"}, "image": {"model": "grok-imagine-image", "provider": "venice"}, "voice": {"model": "grok-voice-latest", "voice": "ara", "provider": "xai"}, "thinking": {"model": "grok-4-3", "provider": "venice"}}'::jsonb,
    updated_at = now()
WHERE key = 'dodi_ai_defaults';

-- reverse:
-- UPDATE public.platform_config
-- SET value = '{"game": {"model": "grok-4.5", "provider": "xai"}, "image": {"model": "grok-imagine-image", "provider": "xai"}, "voice": {"model": "grok-voice-latest", "voice": "ara", "provider": "xai"}, "thinking": {"model": "grok-4.3", "provider": "xai"}}'::jsonb,
--     updated_at = now()
-- WHERE key = 'dodi_ai_defaults';
