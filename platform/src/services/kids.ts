import { sql, type ExpressionBuilder } from "kysely";
import { jsonArrayFrom, jsonObjectFrom } from "kysely/helpers/postgres";

import type { Database, Kid, KidInsert, KidUpdate } from "@dodi/types/database";

import type { Db } from "@/lib/db";

type KidsBuilder = ExpressionBuilder<Database, "kids">;

/** Slim persona projection: no heavy `soul` doc (AI flows load it on demand). */
const PERSONA_EMBED_COLUMNS = [
  "personas.id",
  "personas.name",
  "personas.account_id",
  "personas.is_system_default",
] as const;

/**
 * The kid's active companion id: kids.active_companion_id when it still points
 * at one of the kid's companions, else the oldest companion. Matches
 * activeCompanionOf() on the client.
 */
function activeCompanionId(eb: KidsBuilder) {
  return eb
    .selectFrom("companions")
    .select("companions.id")
    .whereRef("companions.kid_id", "=", "kids.id")
    .orderBy(sql`companions.id = kids.active_companion_id`, "desc")
    .orderBy("companions.created_at", "asc")
    .orderBy("companions.id", "asc")
    .limit(1);
}

/**
 * Companions travel with the kid ("data travels with the row that owns it"),
 * oldest first, each with its slim persona. name_enc / look_enc stay sealed.
 */
function companions(eb: KidsBuilder) {
  return jsonArrayFrom(
    eb
      .selectFrom("companions")
      .select((cb) => [
        "companions.id",
        "companions.persona_id",
        "companions.name_enc",
        "companions.look_enc",
        "companions.created_at",
        jsonObjectFrom(
          cb
            .selectFrom("personas")
            .select(PERSONA_EMBED_COLUMNS)
            .whereRef("personas.id", "=", "companions.persona_id"),
        ).as("persona"),
      ])
      .whereRef("companions.kid_id", "=", "kids.id")
      .orderBy("companions.created_at", "asc")
      .orderBy("companions.id", "asc"),
  ).as("companions");
}

/**
 * The active companion's persona, derived so persona readers (voice session,
 * memory, dashboard) keep a single `active_persona` field. NULL = the system
 * default persona.
 */
function activePersona(eb: KidsBuilder) {
  return jsonObjectFrom(
    eb
      .selectFrom("companions")
      .innerJoin("personas", "personas.id", "companions.persona_id")
      .select(PERSONA_EMBED_COLUMNS)
      .where("companions.id", "=", activeCompanionId(eb)),
  ).as("active_persona");
}

function selectKid(db: Db) {
  return db
    .selectFrom("kids")
    .selectAll("kids")
    .select(companions)
    .select(activePersona);
}

function toKid(row: object): Kid {
  return row as Kid;
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

/**
 * Inserts the kid with its default companion (stock avatar and name, system
 * default persona) and makes that companion active. The server cannot seal, so
 * name_enc / look_enc stay NULL ("catalog defaults").
 */
export async function createKid(db: Db, kid: KidInsert): Promise<Kid> {
  const run = async (trx: Db): Promise<string> => {
    const { id } = await trx
      .insertInto("kids")
      .values(kid)
      .returning("id")
      .executeTakeFirstOrThrow();
    const companion = await trx
      .insertInto("companions")
      .values({ account_id: kid.account_id, kid_id: id })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx
      .updateTable("kids")
      .set({ active_companion_id: companion.id })
      .where("id", "=", id)
      .execute();
    return id;
  };
  const id = db.isTransaction ? await run(db) : await db.transaction().execute(run);
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
