import type { Companion, CompanionUpdate } from "@dodi/types/database";

import type { Db } from "@/lib/db";

/** Companions a kid can have at most. */
export const MAX_COMPANIONS_PER_KID = 6;

/**
 * Domain errors the routes map onto HTTP answers. Everything else is a 500.
 */
export class CompanionError extends Error {
  constructor(
    readonly code:
      | "not_found"
      | "persona_not_found"
      | "companion_limit_reached"
      | "last_companion",
  ) {
    super(code);
    this.name = "CompanionError";
  }
}

/** The sealed and plaintext fields a client may write. */
export interface CompanionFields {
  persona_id?: string | null;
  name_enc?: string | null;
  look_enc?: string | null;
}

/**
 * A persona a companion may point at: the account's own or the system default.
 * Callers on serviceDb (device auth) bypass RLS, so the check is explicit.
 */
export async function assertPersonaUsable(
  db: Db,
  accountId: string,
  personaId: string | null | undefined,
): Promise<void> {
  if (personaId == null) return;
  const persona = await db
    .selectFrom("personas")
    .select("id")
    .where("id", "=", personaId)
    .where((eb) =>
      eb.or([eb("account_id", "=", accountId), eb("is_system_default", "=", true)]),
    )
    .executeTakeFirst();
  if (!persona) throw new CompanionError("persona_not_found");
}

async function assertKidOwned(db: Db, accountId: string, kidId: string): Promise<void> {
  const kid = await db
    .selectFrom("kids")
    .select("id")
    .where("id", "=", kidId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (!kid) throw new CompanionError("not_found");
}

export async function getCompanion(
  db: Db,
  accountId: string,
  companionId: string,
): Promise<Companion | null> {
  const companion = await db
    .selectFrom("companions")
    .selectAll()
    .where("id", "=", companionId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  return companion ?? null;
}

export async function listCompanionsForKid(
  db: Db,
  accountId: string,
  kidId: string,
): Promise<Companion[]> {
  return db
    .selectFrom("companions")
    .selectAll()
    .where("kid_id", "=", kidId)
    .where("account_id", "=", accountId)
    .orderBy("created_at", "asc")
    .orderBy("id", "asc")
    .execute();
}

export async function createCompanion(
  db: Db,
  accountId: string,
  kidId: string,
  fields: CompanionFields,
): Promise<Companion> {
  await assertKidOwned(db, accountId, kidId);
  await assertPersonaUsable(db, accountId, fields.persona_id);
  const existing = await listCompanionsForKid(db, accountId, kidId);
  if (existing.length >= MAX_COMPANIONS_PER_KID) {
    throw new CompanionError("companion_limit_reached");
  }
  return db
    .insertInto("companions")
    .values({
      account_id: accountId,
      kid_id: kidId,
      persona_id: fields.persona_id ?? null,
      name_enc: fields.name_enc ?? null,
      look_enc: fields.look_enc ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateCompanion(
  db: Db,
  accountId: string,
  companionId: string,
  fields: CompanionFields,
): Promise<Companion> {
  await assertPersonaUsable(db, accountId, fields.persona_id);
  const updates: CompanionUpdate = {};
  if (fields.persona_id !== undefined) updates.persona_id = fields.persona_id;
  if (fields.name_enc !== undefined) updates.name_enc = fields.name_enc;
  if (fields.look_enc !== undefined) updates.look_enc = fields.look_enc;
  if (Object.keys(updates).length === 0) {
    const current = await getCompanion(db, accountId, companionId);
    if (!current) throw new CompanionError("not_found");
    return current;
  }
  // An UPDATE matching zero rows is not an error in Postgres; a missing row is.
  const updated = await db
    .updateTable("companions")
    .set(updates)
    .where("id", "=", companionId)
    .where("account_id", "=", accountId)
    .returningAll()
    .executeTakeFirst();
  if (!updated) throw new CompanionError("not_found");
  return updated;
}

/**
 * Deletes a companion. A kid always keeps at least one; when the active one
 * goes, the oldest remaining companion becomes active.
 */
export async function deleteCompanion(
  db: Db,
  accountId: string,
  companionId: string,
): Promise<void> {
  const run = async (trx: Db): Promise<void> => {
    const companion = await getCompanion(trx, accountId, companionId);
    if (!companion) throw new CompanionError("not_found");
    const siblings = await listCompanionsForKid(trx, accountId, companion.kid_id);
    const remaining = siblings.filter((c) => c.id !== companionId);
    if (remaining.length === 0) throw new CompanionError("last_companion");

    await trx.deleteFrom("companions").where("id", "=", companionId).execute();
    // ON DELETE SET NULL already cleared a pointer to it; point at the oldest.
    await trx
      .updateTable("kids")
      .set({ active_companion_id: remaining[0].id })
      .where("id", "=", companion.kid_id)
      .where("account_id", "=", accountId)
      .where("active_companion_id", "is", null)
      .execute();
  };
  // Two writes that must land together: the delete and the reassignment.
  return db.isTransaction ? run(db) : db.transaction().execute(run);
}

/** Makes one of the kid's companions the active one. */
export async function setActiveCompanion(
  db: Db,
  accountId: string,
  kidId: string,
  companionId: string,
): Promise<void> {
  const companion = await getCompanion(db, accountId, companionId);
  if (!companion || companion.kid_id !== kidId) throw new CompanionError("not_found");
  await db
    .updateTable("kids")
    .set({ active_companion_id: companionId })
    .where("id", "=", kidId)
    .where("account_id", "=", accountId)
    .execute();
}

/** The active companion: the pointer when valid, else the oldest. */
export async function getActiveCompanion(
  db: Db,
  accountId: string,
  kidId: string,
): Promise<Companion | null> {
  const kid = await db
    .selectFrom("kids")
    .select("active_companion_id")
    .where("id", "=", kidId)
    .where("account_id", "=", accountId)
    .executeTakeFirst();
  if (!kid) return null;
  const all = await listCompanionsForKid(db, accountId, kidId);
  return all.find((c) => c.id === kid.active_companion_id) ?? all[0] ?? null;
}
