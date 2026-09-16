import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";
import { createCustomGame, getGame, updateCustomGame } from "./games";

/**
 * The Plan-step envelope (games.plan_enc) is opaque to the server: it is
 * stored on create, returned verbatim, and cleared by the settings save. Its
 * presence is what marks a game as still being planned, so the round trip and
 * the clear are the two behaviours worth pinning.
 */
describe("games service: plan_enc", () => {
  let t: TestDatabase;
  let accountId: string;
  let kidId: string;

  beforeAll(async () => {
    t = await createTestDb();
    accountId = await t.createAccount("planner@example.com");
    const kid = await t.serviceDb
      .insertInto("kids")
      .values({ account_id: accountId, display_name: "enc:kid", social_id: "sid-plan" })
      .returning("id")
      .executeTakeFirstOrThrow();
    kidId = kid.id;
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("stores the sealed envelope on create and returns it verbatim", async () => {
    const db = t.scopedDb(accountId);
    const created = await createCustomGame(db, {
      accountId,
      kidId,
      title: "enc:v1:k1:title",
      codeBundle: "enc:v1:k1:placeholder",
      agentTranscriptEnc: "enc:v1:k1:transcript",
      planEnc: "enc:v1:k1:plan",
      createdBy: "parent",
    });
    expect(created.plan_enc).toBe("enc:v1:k1:plan");
    expect(created.is_active).toBe(false);

    const read = await getGame(db, created.id);
    expect(read?.plan_enc).toBe("enc:v1:k1:plan");
  });

  it("defaults to null (not planning) and clears when the settings save sends null", async () => {
    const db = t.scopedDb(accountId);
    const created = await createCustomGame(db, {
      accountId,
      kidId,
      title: "enc:v1:k1:title",
      codeBundle: "enc:v1:k1:placeholder",
      createdBy: "parent",
    });
    expect(created.plan_enc).toBeNull();

    const planned = await updateCustomGame(db, created.id, { plan_enc: "enc:v1:k1:plan" });
    expect(planned.plan_enc).toBe("enc:v1:k1:plan");

    const saved = await updateCustomGame(db, created.id, {
      learning_goal: "enc:v1:k1:goal",
      plan_enc: null,
    });
    expect(saved.plan_enc).toBeNull();
    expect(saved.learning_goal).toBe("enc:v1:k1:goal");
    // Ending planning touches no code: the version chain is untouched.
    expect(saved.current_game_version_id).toBe(created.current_game_version_id);
  });
});
