-- Unlimited kid profiles on every plan (don't punish bigger families).
--
-- The per-plan / per-account `max_kids` entitlement column stays for future
-- flexibility, but its semantics change: NULL = unlimited. Every plan and every
-- existing account is set to NULL, and the accounts default drops from 1 to NULL
-- so trigger-created accounts (handle_new_user, which inserts only id+email and
-- relies on column defaults) are unlimited too. A non-NULL number still caps a
-- single account, so a per-account limit can be reimposed without a new plan.
-- Enforcement (POST /api/kids) treats NULL as "no limit".
--
-- reverse: back-fill accounts from their plan first, then re-seed plan caps and
--          restore NOT NULL + the default:
--   UPDATE public.platform_plans SET max_kids = (CASE handle
--     WHEN 'egg' THEN 1 WHEN 'hatchling' THEN 2 WHEN 'strider' THEN 3
--     WHEN 'apex-dodi' THEN 9 ELSE 1 END);
--   UPDATE public.accounts a SET max_kids = p.max_kids
--     FROM public.platform_plans p WHERE p.handle = a.subscribed_plan;
--   ALTER TABLE public.platform_plans ALTER COLUMN max_kids SET NOT NULL;
--   ALTER TABLE public.accounts ALTER COLUMN max_kids SET DEFAULT 1;
--   ALTER TABLE public.accounts ALTER COLUMN max_kids SET NOT NULL;

-- platform_plans: allow NULL (= unlimited) and clear every plan's cap.
ALTER TABLE "public"."platform_plans" ALTER COLUMN "max_kids" DROP NOT NULL;
UPDATE "public"."platform_plans" SET "max_kids" = NULL;
COMMENT ON COLUMN "public"."platform_plans"."max_kids" IS 'Max kid profiles the plan grants. NULL = unlimited (current value for every plan). Copied onto accounts by applyPlanToAccount.';

-- accounts: allow NULL (= unlimited), drop the old default of 1, and grant
-- unlimited to every existing account.
ALTER TABLE "public"."accounts" ALTER COLUMN "max_kids" DROP NOT NULL;
ALTER TABLE "public"."accounts" ALTER COLUMN "max_kids" DROP DEFAULT;
UPDATE "public"."accounts" SET "max_kids" = NULL;
COMMENT ON COLUMN "public"."accounts"."max_kids" IS 'Max kid profiles for this account (copied from the plan by applyPlanToAccount). NULL = unlimited; POST /api/kids treats NULL as no limit. A non-NULL number still caps this one account without needing a new plan.';
