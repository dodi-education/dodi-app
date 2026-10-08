import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import {
  CompanionError,
  MAX_COMPANIONS_PER_KID,
  createCompanion,
  deleteCompanion,
  setActiveCompanion,
  updateCompanion,
} from "./companions";
import { createKid, getKid } from "./kids";
import { createPersona, deletePersona } from "./personas";

/** companions service + the kid read shape that embeds them, on real PGlite. */
let t: TestDatabase;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

async function account(): Promise<string> {
  return t.createAccount(`parent-${(seq += 1)}@example.com`);
}

async function kid(accountId: string): Promise<string> {
  seq += 1;
  const created = await createKid(t.serviceDb, {
    account_id: accountId,
    display_name: "enc:v1:name",
    social_id: `handle-${seq}`,
  });
  return created.id;
}

async function persona(accountId: string): Promise<string> {
  const created = await createPersona(t.serviceDb, {
    account_id: accountId,
    name: "enc:v1:persona",
    soul: "enc:v1:soul",
  });
  return created.id;
}

async function expectCode(promise: Promise<unknown>, code: CompanionError["code"]): Promise<void> {
  await expect(promise).rejects.toSatisfy(
    (error: unknown) => error instanceof CompanionError && error.code === code,
  );
}

describe("createKid", () => {
  it("creates one default companion and makes it active", async () => {
    const accountId = await account();
    const id = await kid(accountId);

    const row = await getKid(t.serviceDb, id);
    expect(row?.companions).toHaveLength(1);
    const [companion] = row!.companions;
    expect(row?.active_companion_id).toBe(companion.id);
    expect(companion).toMatchObject({ persona_id: null, name_enc: null, look_enc: null, persona: null });
    expect(row?.active_persona).toBeNull();
    expect(row?.can_change_companion_avatar).toBe(false);
  });
});

describe("kid read shape", () => {
  it("derives active_persona from the active companion", async () => {
    const accountId = await account();
    const id = await kid(accountId);
    const personaId = await persona(accountId);
    const second = await createCompanion(t.serviceDb, accountId, id, { persona_id: personaId });

    let row = await getKid(t.serviceDb, id);
    expect(row?.companions.map((c) => c.id)).toEqual([row!.companions[0].id, second.id]);
    expect(row?.companions[1].persona).toMatchObject({ id: personaId, is_system_default: false });
    expect(row?.active_persona).toBeNull();

    await setActiveCompanion(t.serviceDb, accountId, id, second.id);
    row = await getKid(t.serviceDb, id);
    expect(row?.active_persona?.id).toBe(personaId);
  });

  it("falls back to the oldest companion when the pointer is NULL", async () => {
    const accountId = await account();
    const id = await kid(accountId);
    const personaId = await persona(accountId);
    const row = await getKid(t.serviceDb, id);
    await updateCompanion(t.serviceDb, accountId, row!.companions[0].id, { persona_id: personaId });
    await t.serviceDb.updateTable("kids").set({ active_companion_id: null }).where("id", "=", id).execute();

    const after = await getKid(t.serviceDb, id);
    expect(after?.active_persona?.id).toBe(personaId);
  });
});

describe("companion writes", () => {
  it("enforces the per-kid cap", async () => {
    const accountId = await account();
    const id = await kid(accountId);
    for (let i = 1; i < MAX_COMPANIONS_PER_KID; i++) {
      await createCompanion(t.serviceDb, accountId, id, {});
    }
    await expectCode(createCompanion(t.serviceDb, accountId, id, {}), "companion_limit_reached");
  });

  it("refuses another account's persona", async () => {
    const accountId = await account();
    const id = await kid(accountId);
    const foreignPersona = await persona(await account());
    await expectCode(
      createCompanion(t.serviceDb, accountId, id, { persona_id: foreignPersona }),
      "persona_not_found",
    );
  });

  it("refuses deleting the last companion", async () => {
    const accountId = await account();
    const id = await kid(accountId);
    const row = await getKid(t.serviceDb, id);
    await expectCode(deleteCompanion(t.serviceDb, accountId, row!.companions[0].id), "last_companion");
  });

  it("reassigns the active companion when it is deleted", async () => {
    const accountId = await account();
    const id = await kid(accountId);
    const first = (await getKid(t.serviceDb, id))!.companions[0];
    const second = await createCompanion(t.serviceDb, accountId, id, {});
    const third = await createCompanion(t.serviceDb, accountId, id, {});
    await setActiveCompanion(t.serviceDb, accountId, id, third.id);

    await deleteCompanion(t.serviceDb, accountId, third.id);
    const row = await getKid(t.serviceDb, id);
    expect(row?.active_companion_id).toBe(first.id);
    expect(row?.companions.map((c) => c.id)).toEqual([first.id, second.id]);
  });

  it("falls back to the system default when the persona is deleted", async () => {
    const accountId = await account();
    const id = await kid(accountId);
    const personaId = await persona(accountId);
    const companionId = (await getKid(t.serviceDb, id))!.companions[0].id;
    await updateCompanion(t.serviceDb, accountId, companionId, { persona_id: personaId });

    await deletePersona(t.serviceDb, personaId);
    const row = await getKid(t.serviceDb, id);
    expect(row?.companions[0].persona_id).toBeNull();
    expect(row?.active_persona).toBeNull();
  });

  it("does not touch another account's companion", async () => {
    const accountId = await account();
    const id = await kid(accountId);
    const companionId = (await getKid(t.serviceDb, id))!.companions[0].id;
    const other = await account();
    await expectCode(
      updateCompanion(t.serviceDb, other, companionId, { name_enc: "enc:v1:x" }),
      "not_found",
    );
    await expectCode(setActiveCompanion(t.serviceDb, other, id, companionId), "not_found");
  });
});

describe("row-level security", () => {
  it("hides and protects companions from other accounts", async () => {
    const accountId = await account();
    const id = await kid(accountId);
    const other = await account();

    const visible = await t.scopedDb(other).selectFrom("companions").selectAll().where("kid_id", "=", id).execute();
    expect(visible).toEqual([]);

    const own = await t.scopedDb(accountId).selectFrom("companions").selectAll().where("kid_id", "=", id).execute();
    expect(own).toHaveLength(1);

    const updated = await t
      .scopedDb(other)
      .updateTable("companions")
      .set({ name_enc: "enc:v1:hijack" })
      .where("kid_id", "=", id)
      .executeTakeFirst();
    expect(Number(updated.numUpdatedRows)).toBe(0);
  });

  it("rejects a companion stamped with one's own account but another account's kid", async () => {
    const victimKid = await kid(await account());
    const attacker = await account();
    await expect(
      t
        .scopedDb(attacker)
        .insertInto("companions")
        .values({ account_id: attacker, kid_id: victimKid })
        .execute(),
    ).rejects.toThrow();
  });
});

describe("companions migration backfill", () => {
  it("gives every existing kid one companion with its old persona", async () => {
    const old = await createTestDb({ upTo: "20261006130000_dodi_ai_defaults_venice" });
    try {
      const accountId = await old.createAccount("backfill@example.com");
      const db = old.serviceDb as unknown as import("kysely").Kysely<Record<string, Record<string, unknown>>>;
      const { id: personaId } = (await db
        .insertInto("personas")
        .values({ account_id: accountId, name: "enc:v1:p", soul: "" })
        .returning("id")
        .executeTakeFirstOrThrow()) as { id: string };
      const withPersona = (await db
        .insertInto("kids")
        .values({ account_id: accountId, display_name: "a", social_id: "BF-1", active_persona_id: personaId })
        .returning("id")
        .executeTakeFirstOrThrow()) as { id: string };
      const withoutPersona = (await db
        .insertInto("kids")
        .values({ account_id: accountId, display_name: "b", social_id: "BF-2" })
        .returning("id")
        .executeTakeFirstOrThrow()) as { id: string };

      await old.migrateToLatest();

      const a = await getKid(old.serviceDb, withPersona.id);
      const b = await getKid(old.serviceDb, withoutPersona.id);
      expect(a?.companions).toHaveLength(1);
      expect(a?.active_companion_id).toBe(a?.companions[0].id);
      expect(a?.active_persona?.id).toBe(personaId);
      expect(b?.companions).toHaveLength(1);
      expect(b?.active_persona).toBeNull();
      expect(a && "active_persona_id" in a).toBe(false);
    } finally {
      await old.close();
    }
  }, 60_000);
});
