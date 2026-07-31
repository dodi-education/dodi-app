import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Activity, ActivityInsert } from "@dodi/types/database";

type Client = SupabaseClient<Database>;

/** Insert a single activity row. */
export async function logActivity(
  supabase: Client,
  entry: ActivityInsert,
): Promise<void> {
  const { error } = await supabase.from("activities").insert(entry);

  if (error) {
    // Log failures should not crash the caller — swallow and warn
    console.error("[activities] Failed to insert activity:", error.message);
  }
}

/** Batch insert multiple activity rows. */
export async function logActivities(
  supabase: Client,
  entries: ActivityInsert[],
): Promise<void> {
  if (entries.length === 0) return;

  const { error } = await supabase.from("activities").insert(entries);

  if (error) {
    console.error("[activities] Failed to insert activities:", error.message);
  }
}

interface ListActivitiesOptions {
  kidId?: string;
  personaId?: string;
  event?: string;
  limit?: number;
  offset?: number;
}

/** List activities for an account, with optional filters and pagination. */
export async function listActivities(
  supabase: Client,
  accountId: string,
  options: ListActivitiesOptions = {},
): Promise<Activity[]> {
  const {
    kidId,
    personaId,
    event,
    limit = 50,
    offset = 0,
  } = options;

  let query = supabase
    .from("activities")
    .select("*")
    .eq("account_id", accountId)
    // occurred_at, not created_at: offline-synced events land late but must
    // appear at their gameplay moment.
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (kidId) {
    query = query.eq("kid_id", kidId);
  }

  if (personaId) {
    query = query.eq("persona_id", personaId);
  }

  if (event) {
    query = query.eq("event", event);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as unknown as Activity[];
}
