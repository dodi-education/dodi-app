import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@dodi/types/database";

type Client = SupabaseClient<Database>;

export interface DashboardStats {
  sessionsToday: number;
  sessionsThisWeek: number;
  gamesCreated: number;
}

/** Aggregate counts for the parent dashboard stat strip. */
export async function getDashboardStats(
  supabase: Client,
  accountId: string,
): Promise<DashboardStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [today, week, games] = await Promise.all([
    supabase
      .from("system_logs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("event", "session_start")
      .gte("created_at", startOfToday.toISOString()),
    supabase
      .from("system_logs")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("event", "session_start")
      .gte("created_at", startOfWeek.toISOString()),
    supabase
      .from("games")
      .select("id", { count: "exact", head: true })
      .eq("account_id", accountId)
      .eq("is_system", false),
  ]);

  return {
    sessionsToday: today.count ?? 0,
    sessionsThisWeek: week.count ?? 0,
    gamesCreated: games.count ?? 0,
  };
}
