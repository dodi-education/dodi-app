import type { Activity, ActivityInsert } from "@dodi/types/database";

import type { Db } from "@/lib/db";

/** Insert a single activity row. */
export async function logActivity(
  db: Db,
  entry: ActivityInsert,
): Promise<void> {
  try {
    await db.insertInto("activities").values(entry).execute();
  } catch (error) {
    // Log failures should not crash the caller — swallow and warn
    console.error(
      "[activities] Failed to insert activity:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Batch insert multiple activity rows. */
export async function logActivities(
  db: Db,
  entries: ActivityInsert[],
): Promise<void> {
  if (entries.length === 0) return;

  try {
    await db.insertInto("activities").values(entries).execute();
  } catch (error) {
    console.error(
      "[activities] Failed to insert activities:",
      error instanceof Error ? error.message : error,
    );
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
  db: Db,
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

  let query = db
    .selectFrom("activities")
    .selectAll()
    .where("account_id", "=", accountId)
    // occurred_at, not created_at: offline-synced events land late but must
    // appear at their gameplay moment.
    .orderBy("occurred_at", "desc")
    .offset(offset)
    .limit(limit);

  if (kidId) {
    query = query.where("kid_id", "=", kidId);
  }

  if (personaId) {
    query = query.where("persona_id", "=", personaId);
  }

  if (event) {
    query = query.where("event", "=", event);
  }

  return query.execute();
}
