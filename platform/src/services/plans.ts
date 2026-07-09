/**
 * Plan catalogue service. `platform_plans` is the source of truth for
 * subscribable plans (keyed by a unique `handle`); `platform_plan_translations`
 * localizes the title (base row = en, like game_translations). `applyPlanToAccount`
 * COPIES a plan's entitlement columns onto an account — so enforcement reads the
 * account columns and a single account's caps can be raised without a new plan.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  PlatformPlan,
  PlatformPlanTranslation,
} from "@dodi/types/database";

import { updateAccount } from "./accounts";

type Client = SupabaseClient<Database>;

/** All active plans, ordered for display. */
export async function getPlans(supabase: Client): Promise<PlatformPlan[]> {
  const { data, error } = await supabase
    .from("platform_plans")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as PlatformPlan[];
}

export async function getPlanByHandle(
  supabase: Client,
  handle: string,
): Promise<PlatformPlan | null> {
  const { data, error } = await supabase
    .from("platform_plans")
    .select("*")
    .eq("handle", handle)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data as unknown as PlatformPlan;
}

async function getPlanTranslations(
  supabase: Client,
  planIds: string[],
  locale: string,
): Promise<Map<string, PlatformPlanTranslation>> {
  if (planIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("platform_plan_translations")
    .select("*")
    .in("plan_id", planIds)
    .eq("locale", locale);

  if (error) throw error;
  const map = new Map<string, PlatformPlanTranslation>();
  for (const row of (data ?? []) as unknown as PlatformPlanTranslation[]) {
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
  supabase: Client,
  locale: string,
): Promise<LocalizedPlan[]> {
  const plans = await getPlans(supabase);
  const translations = await getPlanTranslations(
    supabase,
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
  supabase: Client,
  accountId: string,
  handle: string,
): Promise<void> {
  const plan = await getPlanByHandle(supabase, handle);
  if (!plan || !plan.is_active) {
    throw new Error(`Unknown or inactive plan handle: ${handle}`);
  }
  await updateAccount(supabase, accountId, {
    subscribed_plan: plan.handle,
    max_kids: plan.max_kids,
    max_custom_personas: plan.max_custom_personas,
    max_storage_mb_per_kid: plan.max_storage_mb_per_kid,
    memory_tier: plan.memory_tier,
  });
}
