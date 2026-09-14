import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";

import { getEncryptedProviders, setEncryptedProviders } from "./ai-providers";

/**
 * What the client actually PUTs: one opaque `enc:v1:` blob holding the whole
 * provider map, sealed under the account VMK. It is a bare string, NOT JSON —
 * which is why `accounts.encrypted_api_keys` is `text` and not `jsonb`. Bound
 * to a jsonb parameter, `pg` sends it verbatim and Postgres rejects it with
 * "invalid input syntax for type json", so no provider key could be saved.
 */
const BLOB = "enc:v1:k1:YWJjZGVmZ2hpamts:c2VhbGVkLXhhaS1rZXk=";
const REKEYED = "enc:v1:k1:bmV3LW5vbmNlLWhlcmU:cmVzZWFsZWQtbWFw";

let t: TestDatabase;
let accountId: string;

beforeAll(async () => {
  t = await createTestDb();
  accountId = await t.createAccount("parent@example.com");
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.serviceDb
    .updateTable("accounts")
    .set({ encrypted_api_keys: null })
    .where("id", "=", accountId)
    .execute();
});

describe("setEncryptedProviders", () => {
  it("stores a sealed blob and reads it back byte-for-byte", async () => {
    const db = t.scopedDb(accountId);
    await setEncryptedProviders(db, accountId, BLOB);
    expect(await getEncryptedProviders(db, accountId)).toBe(BLOB);
  });

  it("overwrites on re-seal (add/remove a key re-seals the whole map)", async () => {
    const db = t.scopedDb(accountId);
    await setEncryptedProviders(db, accountId, BLOB);
    await setEncryptedProviders(db, accountId, REKEYED);
    expect(await getEncryptedProviders(db, accountId)).toBe(REKEYED);
  });

  it("scopes the write to the calling account", async () => {
    const other = await t.createAccount("other@example.com");
    await setEncryptedProviders(t.scopedDb(accountId), accountId, BLOB);
    expect(await getEncryptedProviders(t.scopedDb(other), other)).toBeNull();
  });
});

describe("getEncryptedProviders", () => {
  it("returns null for an account that has configured no provider", async () => {
    expect(await getEncryptedProviders(t.scopedDb(accountId), accountId)).toBeNull();
  });
});
