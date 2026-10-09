import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  CreateCharacterAssetSchema,
  UpdateCharacterAssetSchema,
} from "@/lib/character-asset-api";
import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import {
  CharacterAssetError,
  MAX_CHARACTER_ASSETS_PER_ACCOUNT,
  createCharacterAsset,
  deleteCharacterAsset,
  getCharacterAsset,
  listCharacterAssets,
  updateCharacterAsset,
  type CharacterAssetCreate,
} from "./character-assets";

let t: TestDatabase;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

async function account(): Promise<string> {
  return t.createAccount(`asset-parent-${(seq += 1)}@example.com`);
}

function asset(
  overrides: Partial<CharacterAssetCreate> = {},
): CharacterAssetCreate {
  return {
    kind: "accessory",
    name_enc: "enc:v1:k:n:name",
    meta_enc: "enc:v1:k:n:meta",
    glb_enc: "enc:v1:k:n:glb",
    byte_size: 1234,
    ...overrides,
  };
}

const isCode = (code: CharacterAssetError["code"]) => (e: unknown) =>
  e instanceof CharacterAssetError && e.code === code;

describe("character assets", () => {
  it("stores, lists (without the file), reads, updates and deletes sealed assets", async () => {
    const accountId = await account();
    const db = t.scopedDb(accountId);
    const created = await createCharacterAsset(
      db,
      accountId,
      asset({ kind: "avatar" }),
    );
    expect(created).not.toHaveProperty("glb_enc");
    expect(created).not.toHaveProperty("account_id");
    expect(created).toMatchObject({
      kind: "avatar",
      name_enc: "enc:v1:k:n:name",
      byte_size: 1234,
    });

    const list = await listCharacterAssets(db, accountId);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("glb_enc");
    expect(Object.keys(list[0]).sort()).toEqual(
      [
        "byte_size",
        "created_at",
        "id",
        "kind",
        "meta_enc",
        "name_enc",
        "updated_at",
      ].sort(),
    );

    expect((await getCharacterAsset(db, accountId, created.id)).glb_enc).toBe(
      "enc:v1:k:n:glb",
    );

    const updated = await updateCharacterAsset(db, accountId, created.id, {
      name_enc: "enc:v1:k:n:renamed",
      glb_enc: "enc:v1:k:n:glb2",
      byte_size: 99,
    });
    expect(updated).toMatchObject({
      name_enc: "enc:v1:k:n:renamed",
      byte_size: 99,
      kind: "avatar",
    });
    expect((await getCharacterAsset(db, accountId, created.id)).glb_enc).toBe(
      "enc:v1:k:n:glb2",
    );

    await deleteCharacterAsset(db, accountId, created.id);
    expect(await listCharacterAssets(db, accountId)).toEqual([]);
    await expect(
      deleteCharacterAsset(db, accountId, created.id),
    ).rejects.toSatisfy(isCode("not_found"));
    await expect(
      getCharacterAsset(db, accountId, created.id),
    ).rejects.toSatisfy(isCode("not_found"));
  });

  it("caps assets per account", async () => {
    const accountId = await account();
    for (let i = 0; i < MAX_CHARACTER_ASSETS_PER_ACCOUNT; i++) {
      await createCharacterAsset(t.serviceDb, accountId, asset());
    }
    await expect(
      createCharacterAsset(t.serviceDb, accountId, asset()),
    ).rejects.toSatisfy(isCode("asset_limit_reached"));
  });

  it("enforces the per-kind size budgets", async () => {
    const accountId = await account();
    await expect(
      createCharacterAsset(
        t.serviceDb,
        accountId,
        asset({ kind: "accessory", byte_size: 1024 * 1024 + 1 }),
      ),
    ).rejects.toSatisfy(isCode("too_large"));
    const avatar = await createCharacterAsset(
      t.serviceDb,
      accountId,
      asset({ kind: "avatar", byte_size: 3 * 1024 * 1024 }),
    );
    await expect(
      updateCharacterAsset(t.serviceDb, accountId, avatar.id, {
        byte_size: 3 * 1024 * 1024 + 1,
        glb_enc: "enc:v1:x",
      }),
    ).rejects.toSatisfy(isCode("too_large"));
    // The table's own CHECK holds too, behind the service.
    await expect(
      t.serviceDb
        .insertInto("character_assets")
        .values({
          account_id: accountId,
          kind: "accessory",
          name_enc: "n",
          glb_enc: "g",
          byte_size: 2 * 1024 * 1024,
        })
        .execute(),
    ).rejects.toThrow();
  });

  it("is hidden from other accounts, by the service and by RLS", async () => {
    const accountId = await account();
    const created = await createCharacterAsset(
      t.scopedDb(accountId),
      accountId,
      asset(),
    );
    const other = await account();
    expect(await listCharacterAssets(t.scopedDb(other), other)).toEqual([]);
    await expect(
      getCharacterAsset(t.serviceDb, other, created.id),
    ).rejects.toSatisfy(isCode("not_found"));
    await expect(
      updateCharacterAsset(t.serviceDb, other, created.id, {
        name_enc: "enc:v1:x",
      }),
    ).rejects.toSatisfy(isCode("not_found"));
    await expect(
      deleteCharacterAsset(t.serviceDb, other, created.id),
    ).rejects.toSatisfy(isCode("not_found"));
    // RLS alone: even unscoped by app code, another account sees and changes nothing.
    expect(
      await t
        .scopedDb(other)
        .selectFrom("character_assets")
        .selectAll()
        .execute(),
    ).toEqual([]);
    await expect(
      t
        .scopedDb(other)
        .insertInto("character_assets")
        .values({
          account_id: accountId,
          kind: "avatar",
          name_enc: "n",
          glb_enc: "g",
          byte_size: 1,
        })
        .execute(),
    ).rejects.toThrow();
    const deleted = await t
      .scopedDb(other)
      .deleteFrom("character_assets")
      .where("id", "=", created.id)
      .executeTakeFirst();
    expect(Number(deleted.numDeletedRows)).toBe(0);
  });

  it("goes with its account", async () => {
    const accountId = await account();
    await createCharacterAsset(t.serviceDb, accountId, asset());
    await t.serviceDb
      .deleteFrom("accounts")
      .where("id", "=", accountId)
      .execute();
    expect(
      await t.serviceDb
        .selectFrom("character_assets")
        .select("id")
        .where("account_id", "=", accountId)
        .execute(),
    ).toEqual([]);
  });
});

describe("character asset request bodies", () => {
  const body = {
    kind: "avatar",
    name_enc: "enc:v1:k:n:c",
    glb_enc: "enc:v1:k:n:c",
    byte_size: 10,
  };

  it("accept sealed records and refuse plaintext", () => {
    expect(CreateCharacterAssetSchema.safeParse(body).success).toBe(true);
    expect(
      CreateCharacterAssetSchema.safeParse({ ...body, meta_enc: null }).success,
    ).toBe(true);
    expect(
      CreateCharacterAssetSchema.safeParse({ ...body, name_enc: "Dragon" })
        .success,
    ).toBe(false);
    expect(
      CreateCharacterAssetSchema.safeParse({ ...body, glb_enc: "Z2xURg==" })
        .success,
    ).toBe(false);
    expect(
      CreateCharacterAssetSchema.safeParse({ ...body, kind: "hat" }).success,
    ).toBe(false);
    expect(
      CreateCharacterAssetSchema.safeParse({ ...body, byte_size: 0 }).success,
    ).toBe(false);
  });

  it("take a new file only with its size", () => {
    expect(
      UpdateCharacterAssetSchema.safeParse({ name_enc: "enc:v1:k:n:c" })
        .success,
    ).toBe(true);
    expect(
      UpdateCharacterAssetSchema.safeParse({ glb_enc: "enc:v1:k:n:c" }).success,
    ).toBe(false);
    expect(
      UpdateCharacterAssetSchema.safeParse({
        glb_enc: "enc:v1:k:n:c",
        byte_size: 5,
      }).success,
    ).toBe(true);
  });
});
