import type { Db } from "@/lib/db";

export interface DashboardStats {
  sessionsToday: number;
  sessionsThisWeek: number;
  gamesCreated: number;
}

/** Aggregate counts for the parent dashboard stat strip. */
export async function getDashboardStats(
  db: Db,
  accountId: string,
): Promise<DashboardStats> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [today, week, games] = await Promise.all([
    db
      .selectFrom("activities")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("account_id", "=", accountId)
      .where("event", "=", "session_start")
      .where("created_at", ">=", startOfToday.toISOString())
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("activities")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("account_id", "=", accountId)
      .where("event", "=", "session_start")
      .where("created_at", ">=", startOfWeek.toISOString())
      .executeTakeFirstOrThrow(),
    db
      .selectFrom("games")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("account_id", "=", accountId)
      .where("is_system", "=", false)
      // Publication copies duplicate a game the parent already made.
      .where("publication_requested_at", "is", null)
      .executeTakeFirstOrThrow(),
  ]);

  return {
    sessionsToday: Number(today.count ?? 0),
    sessionsThisWeek: Number(week.count ?? 0),
    gamesCreated: Number(games.count ?? 0),
  };
}
