import type { ExpressionBuilder } from "kysely";
import { jsonObjectFrom } from "kysely/helpers/postgres";

import type { Database, Kid, KidInsert, KidUpdate } from "@dodi/types/database";

import type { Db } from "@/lib/db";

/**
 * Kid read shape: the active persona travels with the kid ("data travels with
 * the row that owns it") as a slim embed via the active_persona_id FK, so
 * clients never fetch /api/personas just to label a kid. The heavy `soul` doc
 * is deliberately excluded — AI flows load the full persona at session start.
 */
function activePersona(eb: ExpressionBuilder<Database, "kids">) {
  return jsonObjectFrom(
    eb
      .selectFrom("personas")
      .select([
        "personas.id",
        "personas.name",
        "personas.account_id",
        "personas.is_system_default",
      ])
      .whereRef("personas.id", "=", "kids.active_persona_id"),
  ).as("active_persona");
}

/** Strip the raw FK — the read shape carries the embedded object instead. */
function toKid(row: Record<string, unknown>): Kid {
  const { active_persona_id: _fk, ...kid } = row;
  return kid as Kid;
}

function selectKid(db: Db) {
  return db.selectFrom("kids").selectAll("kids").select(activePersona);
}

export async function listKids(db: Db, accountId: string): Promise<Kid[]> {
  const rows = await selectKid(db)
    .where("kids.account_id", "=", accountId)
    .orderBy("kids.created_at", "asc")
    .execute();
  return rows.map(toKid);
}

export async function getKid(db: Db, kidId: string): Promise<Kid | null> {
  const row = await selectKid(db).where("kids.id", "=", kidId).executeTakeFirst();
  return row ? toKid(row) : null;
}

export async function createKid(db: Db, kid: KidInsert): Promise<Kid> {
  const { id } = await db
    .insertInto("kids")
    .values(kid)
    .returning("id")
    .executeTakeFirstOrThrow();
  const created = await getKid(db, id);
  if (!created) throw new Error(`Kid ${id} vanished after insert`);
  return created;
}

export async function updateKid(
  db: Db,
  kidId: string,
  updates: KidUpdate,
): Promise<Kid> {
  await db
    .updateTable("kids")
    .set(updates)
    .where("id", "=", kidId)
    .returning("id")
    .executeTakeFirstOrThrow();
  const updated = await getKid(db, kidId);
  if (!updated) throw new Error(`Kid ${kidId} vanished after update`);
  return updated;
}

export async function deleteKid(db: Db, kidId: string): Promise<void> {
  await db.deleteFrom("kids").where("id", "=", kidId).execute();
}
