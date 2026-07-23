-- Idempotent patch to bring an already-initialized REMOTE Supabase (dev + the
-- separate prod project) in line with migration
-- 20260723120000_unlimited_kid_profiles: every plan and account gets UNLIMITED
-- kid profiles. `max_kids` NULL now means "no limit"; a non-NULL number caps a
-- single account. POST /api/kids treats NULL as unlimited.
--
-- Safe to run multiple times. Apply via the Supabase SQL editor or psql.

-- platform_plans: allow NULL (= unlimited) and clear every plan's cap.
ALTER TABLE "public"."platform_plans" ALTER COLUMN "max_kids" DROP NOT NULL;
UPDATE "public"."platform_plans" SET "max_kids" = NULL WHERE "max_kids" IS NOT NULL;

-- accounts: allow NULL (= unlimited), drop the default of 1, grant unlimited to all.
ALTER TABLE "public"."accounts" ALTER COLUMN "max_kids" DROP NOT NULL;
ALTER TABLE "public"."accounts" ALTER COLUMN "max_kids" DROP DEFAULT;
UPDATE "public"."accounts" SET "max_kids" = NULL WHERE "max_kids" IS NOT NULL;
