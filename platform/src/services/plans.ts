/**
 * Plan catalogue service. `platform_plans` is the source of truth for
 * subscribable plans (keyed by a unique `handle`); `platform_plan_translations`
 * localizes the title (base row = en, like game_translations). `applyPlanToAccount`
 * COPIES a plan's entitlement columns onto an account — so enforcement reads the
 * account columns and a single account's caps can be raised without a new plan.
 */

import type {
  PlatformPlan,
  PlatformPlanTranslation,
} from "@dodi/types/database";

import type { Db } from "@/lib/db";

import { updateAccount } from "./accounts";

/** All active plans, ordered for display. */
export async function getPlans(db: Db): Promise<PlatformPlan[]> {
  return db
    .selectFrom("platform_plans")
    .selectAll()
    .where("is_active", "=", true)
    .orderBy("sort_order", "asc")
    .execute();
}

export async function getPlanByHandle(
  db: Db,
  handle: string,
): Promise<PlatformPlan | null> {
  const row = await db
    .selectFrom("platform_plans")
    .selectAll()
    .where("handle", "=", handle)
    .executeTakeFirst();
  return row ?? null;
}

async function getPlanTranslations(
  db: Db,
  planIds: string[],
  locale: string,
): Promise<Map<string, PlatformPlanTranslation>> {
  if (planIds.length === 0) return new Map();
  const rows = await db
    .selectFrom("platform_plan_translations")
    .selectAll()
    .where("plan_id", "in", planIds)
    .where("locale", "=", locale)
    .execute();

  const map = new Map<string, PlatformPlanTranslation>();
  for (const row of rows) {
    map.set(row.plan_id, row);
  }
  return map;
}

/** A plan with its localized title + tagline applied (base row = en fallback). */
export interface LocalizedPlan extends PlatformPlan {
  tagline: string;
}

/** Active plans with `locale` title/tagline applied — the catalogue for the picker. */
export async function getLocalizedPlans(
  db: Db,
  locale: string,
): Promise<LocalizedPlan[]> {
  const plans = await getPlans(db);
  const translations = await getPlanTranslations(
    db,
    plans.map((p) => p.id),
    locale,
  );
  return plans.map((p) => {
    const t = translations.get(p.id);
    return { ...p, title: t?.title || p.title, tagline: t?.tagline ?? "" };
  });
}

/**
 * Subscribe an account to a plan: set `subscribed_plan` to the handle and COPY
 * the plan's entitlement columns onto the account. Called at onboarding and on
 * any later plan change. Throws if the handle is unknown/inactive.
 */
export async function applyPlanToAccount(
  db: Db,
  accountId: string,
  handle: string,
): Promise<void> {
  const plan = await getPlanByHandle(db, handle);
  if (!plan || !plan.is_active) {
    throw new Error(`Unknown or inactive plan handle: ${handle}`);
  }
  await updateAccount(db, accountId, {
    subscribed_plan: plan.handle,
    max_kids: plan.max_kids,
    max_custom_personas: plan.max_custom_personas,
    max_storage_mb_per_kid: plan.max_storage_mb_per_kid,
    memory_tier: plan.memory_tier,
  });
}
