import type { CustomTrick } from "@dodi/types/database";

import type { Db } from "@/lib/db";

/** Custom tricks a companion can know at most. */
export const MAX_CUSTOM_TRICKS_PER_COMPANION = 24;

export class CustomTrickError extends Error {
  constructor(readonly code: "not_found" | "trick_limit_reached") {
    super(code);
    this.name = "CustomTrickError";
  }
}

async function assertCompanionOwned(db: Db, accountId: string, companionId: string): Promise<void> {
  const companion = await db
    .selectFrom("companions")
    .select("id")
    .where("id", "=", companionId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (!companion) throw new CustomTrickError("not_found");
}

/** A companion's custom tricks, oldest first (bounded by the per-companion cap). */
export async function listCustomTricks(
  db: Db,
  accountId: string,
  companionId: string,
): Promise<CustomTrick[]> {
  await assertCompanionOwned(db, accountId, companionId);
  return db
    .selectFrom("custom_tricks")
    .selectAll()
    .where("companion_id", "=", companionId)
    .where("account_id", "=", accountId)
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .limit(MAX_CUSTOM_TRICKS_PER_COMPANION)
    .execute();
}

/** Stores a sealed trick. trick_enc is opaque to the server. */
export async function createCustomTrick(
  db: Db,
  accountId: string,
  companionId: string,
  trickEnc: string,
): Promise<CustomTrick> {
  const existing = await listCustomTricks(db, accountId, companionId);
  if (existing.length >= MAX_CUSTOM_TRICKS_PER_COMPANION) {
    throw new CustomTrickError("trick_limit_reached");
  }
  return db
    .insertInto("custom_tricks")
    .values({ account_id: accountId, companion_id: companionId, trick_enc: trickEnc })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteCustomTrick(
  db: Db,
  accountId: string,
  companionId: string,
  trickId: string,
): Promise<void> {
  const deleted = await db
    .deleteFrom("custom_tricks")
    .where("id", "=", trickId)
    .where("companion_id", "=", companionId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (Number(deleted.numDeletedRows) === 0) throw new CustomTrickError("not_found");
}
