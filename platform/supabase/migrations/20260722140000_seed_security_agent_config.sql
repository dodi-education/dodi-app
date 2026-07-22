-- Seed the three security-agent rows in platform_config (a KEY/VALUE table —
-- these are rows, not columns) so the operator can fill in the values directly
-- in the dashboard instead of authoring the INSERT themselves.
--
-- Blank ("") means the harness is DISABLED; it activates once all three hold
-- real values. Values are jsonb strings, e.g.:
--
--   UPDATE "public"."platform_config" SET "value" = '"anthropic"',        "updated_at" = now() WHERE "key" = 'security_agent_provider';
--   UPDATE "public"."platform_config" SET "value" = '"claude-sonnet-4-6"', "updated_at" = now() WHERE "key" = 'security_agent_model';
--   UPDATE "public"."platform_config" SET "value" = '"sk-ant-..."',        "updated_at" = now() WHERE "key" = 'security_agent_key';
--
-- provider must be an id from the @dodi/ai registry (gemini|anthropic|xai) and
-- the model one of its "thinking"-capable models. The table stays default-deny
-- (service-role only), so the key is readable by the platform alone.

-- forward:

INSERT INTO "public"."platform_config" ("key", "value") VALUES
  ('security_agent_provider', '""'::jsonb),
  ('security_agent_model',    '""'::jsonb),
  ('security_agent_key',      '""'::jsonb)
ON CONFLICT ("key") DO NOTHING;

-- reverse:
-- DELETE FROM "public"."platform_config"
--   WHERE "key" IN ('security_agent_provider', 'security_agent_model', 'security_agent_key');
