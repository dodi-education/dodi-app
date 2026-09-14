import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SuccessCriteria } from "@dodi/types/success";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";

import { createCustomGame, getGame } from "./games";

/**
 * `games.success_criteria` is deliberately polymorphic jsonb: a plain object for
 * system games and publication copies, an opaque `enc:v1:` string scalar for
 * private ones. A bare string bound to a jsonb parameter is parsed BY POSTGRES
 * as JSON and rejected ("invalid input syntax for type json"), so the sealed
 * form has to be encoded as a JSON string scalar on the way in — and must come
 * back out as the same bare string for the client to decrypt.
 */
const SEALED = "enc:v1:k1:bm9uY2UtZ29lcy1oZXJl:c2VhbGVkLWNyaXRlcmlh";

const PLAIN: SuccessCriteria = {
  description: "Solve 3 sums",
  match: "all",
  conditions: [],
  requiredMetrics: [],
};

let t: TestDatabase;
let accountId: string;

beforeAll(async () => {
  t = await createTestDb();
  accountId = await t.createAccount("parent@example.com");
});

afterAll(async () => {
  await t.close();
});

describe("createCustomGame success_criteria", () => {
  it("round-trips a sealed enc:v1: blob unchanged", async () => {
    const db = t.scopedDb(accountId);
    const created = await createCustomGame(db, {
      accountId,
      title: "enc:v1:k1:aa:bb",
      codeBundle: "enc:v1:k1:cc:dd",
      successCriteria: SEALED,
    });

    expect(created.success_criteria).toBe(SEALED);
    const reread = await getGame(db, created.id);
    expect(reread?.success_criteria).toBe(SEALED);
  });

  it("still stores a plain criteria object as a jsonb object", async () => {
    const db = t.scopedDb(accountId);
    const created = await createCustomGame(db, {
      accountId,
      title: "enc:v1:k1:ee:ff",
      codeBundle: "enc:v1:k1:gg:hh",
      successCriteria: PLAIN,
    });

    expect(created.success_criteria).toEqual(PLAIN);
  });

  it("defaults to an empty object when the caller sends none", async () => {
    const created = await createCustomGame(t.scopedDb(accountId), {
      accountId,
      title: "enc:v1:k1:ii:jj",
      codeBundle: "enc:v1:k1:kk:ll",
    });

    expect(created.success_criteria).toEqual({});
  });
});
