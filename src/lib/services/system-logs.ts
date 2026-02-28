import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, SystemLog, SystemLogInsert } from "@/types/database";

type Client = SupabaseClient<Database>;

/** Insert a single log entry. */
export async function logMemoryEvent(
  supabase: Client,
  entry: SystemLogInsert,
): Promise<void> {
  const { error } = await supabase
    .from("system_logs")
    .insert(entry);

  if (error) {
    // Log failures should not crash the caller — swallow and warn
    console.error("[system-logs] Failed to insert log entry:", error.message);
  }
}

/** Batch insert multiple log entries. */
export async function logMemoryEvents(
  supabase: Client,
  entries: SystemLogInsert[],
): Promise<void> {
  if (entries.length === 0) return;

  const { error } = await supabase
    .from("system_logs")
    .insert(entries);

  if (error) {
    console.error("[system-logs] Failed to insert log entries:", error.message);
  }
}

interface ListSystemLogsOptions {
  profileId?: string;
  personaId?: string;
  event?: string;
  limit?: number;
  offset?: number;
}

/** List system logs for an account, with optional filters and pagination. */
export async function listSystemLogs(
  supabase: Client,
  accountId: string,
  options: ListSystemLogsOptions = {},
): Promise<SystemLog[]> {
  const {
    profileId,
    personaId,
    event,
    limit = 50,
    offset = 0,
  } = options;

  let query = supabase
    .from("system_logs")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (profileId) {
    query = query.eq("profile_id", profileId);
  }

  if (personaId) {
    query = query.eq("persona_id", personaId);
  }

  if (event) {
    query = query.eq("event", event);
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as unknown as SystemLog[];
}
