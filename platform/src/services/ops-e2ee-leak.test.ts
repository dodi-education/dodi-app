import { afterAll, beforeAll, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";
import { resolveOpsRange } from "./ops-range";
import { getOpsAiRequestShare, getOpsGameStats, getOpsKpis } from "./ops-stats";
import { listOpsAccounts, listOpsGames } from "./ops-lists";
import { listOpsErrorLogs } from "./error-logs";

/**
 * The end-to-end encryption tripwire for the ops console.
 *
 * Individual service tests check their own projections, but a leak is a
 * whole-surface property: any future ops endpoint that selects one column too
 * many exposes parent and kid content to staff. So this seeds a family whose
 * every encrypted field is recognisable ciphertext, asks every ops read model
 * for its response, and asserts that no `enc:v1:` record appears anywhere in
 * any of them.
 *
 * Add new ops endpoints to `payloads` below. That is the point of the file.
 */

let t: TestDatabase;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

it("never returns encrypted content from any ops read model", async () => {
  const paid = await t.createAccount("paid@example.com");
  const free = await t.createAccount("free@example.com");
  const now = Date.now();
  const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

  await t.serviceDb
    .updateTable("accounts")
    .set({
      subscribed_plan: "hatchling",
      publication_handle: "keller_fam",
      flagged_for_review_at: iso(3 * 86_400_000),
      model_config: {
        voiceProvider: "dodi",
        voiceModel: "default",
        voiceName: "ara",
        thinkingProvider: "anthropic",
        thinkingModel: "claude-sonnet-4-6",
      } as never,
    })
    .where("id", "=", paid)
    .execute();

  const kids = await t.serviceDb
    .insertInto("kids")
    .values([
      { account_id: paid, display_name: "enc:v1:aaa", social_id: "dump-kid-1" },
      { account_id: free, display_name: "enc:v1:bbb", social_id: "dump-kid-2" },
    ])
    .returning("id")
    .execute();

  // A private game (E2EE, must never surface) and a publication copy (plaintext).
  const priv = await t.serviceDb
    .insertInto("games")
    .values({
      account_id: paid,
      kid_id: kids[0].id,
      title: "enc:v1:secret-title",
      description: "enc:v1:secret-description",
      code_bundle: "enc:v1:secret-bundle",
      tags: ["math", "ai"],
      created_by: "parent",
      created_at: iso(5 * 86_400_000),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  const pending = await t.serviceDb
    .insertInto("games")
    .values({
      account_id: paid,
      source_game_id: priv.id,
      published_by_account_id: paid,
      title: "Rocket Count-Up",
      description: "Counting to 100 with rocket launches",
      code_bundle: "<html></html>",
      tags: ["math"],
      created_by: "parent",
      publication_requested_at: iso(2 * 3_600_000),
      available_locales: ["en", "de"],
      created_at: iso(2 * 3_600_000),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  // One publication copy per source game (games_publication_source_uniq), so
  // the declined copy needs a source of its own.
  const priv2 = await t.serviceDb
    .insertInto("games")
    .values({
      account_id: paid,
      kid_id: kids[0].id,
      title: "enc:v1:secret-title-2",
      description: "enc:v1:secret-description-2",
      code_bundle: "enc:v1:secret-bundle-2",
      tags: ["math", "reading"],
      created_by: "parent",
      created_at: iso(6 * 86_400_000),
    })
    .returning("id")
    .executeTakeFirstOrThrow();

  await t.serviceDb
    .insertInto("games")
    .values({
      account_id: paid,
      source_game_id: priv2.id,
      published_by_account_id: paid,
      title: "Candy Shop Sums",
      description: "Money maths in a sweets shop",
      code_bundle: "<html></html>",
      tags: ["math"],
      created_by: "parent",
      publication_requested_at: iso(4 * 86_400_000),
      rejected_at: iso(3 * 86_400_000),
      rejection_kind: "soft",
      rejection_reasons: [
        { code: "soft_quality_below_bar", note: "The second level dead-ends." },
      ] as never,
      review_attempts: 1,
      created_at: iso(4 * 86_400_000),
    })
    .execute();

  await t.serviceDb
    .insertInto("game_plays")
    .values([
      {
        account_id: paid,
        kid_id: kids[0].id,
        game_id: priv.id,
        started_at: iso(2 * 86_400_000),
        ended_at: iso(2 * 86_400_000 - 900_000),
        succeeded: true,
        created_at: iso(2 * 86_400_000),
      },
      {
        account_id: paid,
        kid_id: kids[0].id,
        game_id: priv.id,
        started_at: iso(86_400_000),
        ended_at: iso(86_400_000 - 600_000),
        succeeded: false,
        created_at: iso(86_400_000),
      },
    ])
    .execute();

  await t.serviceDb
    .insertInto("activities")
    .values({
      account_id: paid,
      kid_id: kids[0].id,
      event: "session_start",
      message: "Session started",
      occurred_at: iso(3_600_000),
      created_at: iso(3_600_000),
    })
    .execute();

  await t.serviceDb
    .insertInto("ai_usage_logs")
    .values([
      {
        account_id: paid,
        kid_id: kids[0].id,
        event_type: "voice_minutes",
        provider: "xai",
        model: "grok-voice-latest",
        voice_seconds: 420,
        created_at: iso(86_400_000),
      },
      {
        account_id: free,
        kid_id: kids[1].id,
        event_type: "game_create",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        created_at: iso(86_400_000),
      },
    ])
    .execute();

  await t.serviceDb
    .insertInto("error_logs")
    .values({
      account_id: paid,
      type: "server",
      context: "api/games#POST",
      error_name: "DatabaseError",
      error_message: "duplicate key value violates unique constraint",
      http_status: 500,
      created_at: iso(3_600_000),
    })
    .execute();

  const range = resolveOpsRange("30d", new Date(now));

  const payloads: Record<string, unknown> = {
    kpis: await getOpsKpis(t.serviceDb, range),
    gameStats: await getOpsGameStats(t.serviceDb, range),
    aiRequests: await getOpsAiRequestShare(t.serviceDb, range),
    accounts: await listOpsAccounts(t.serviceDb, { status: "all", page: 1, limit: 25 }),
    accountsPaid: await listOpsAccounts(t.serviceDb, { status: "paid", page: 1, limit: 25 }),
    accountsTrial: await listOpsAccounts(t.serviceDb, { status: "trial", page: 1, limit: 25 }),
    accountsSearch: await listOpsAccounts(t.serviceDb, {
      status: "all",
      query: "paid@",
      page: 1,
      limit: 25,
    }),
    games: await listOpsGames(t.serviceDb, {
      state: "all",
      sort: "submitted_desc",
      page: 1,
      limit: 25,
    }),
    gamesRequested: await listOpsGames(t.serviceDb, {
      state: "requested",
      sort: "submitted_desc",
      page: 1,
      limit: 25,
    }),
    gamesDeclinedSoft: await listOpsGames(t.serviceDb, {
      state: "declined_soft",
      sort: "rejected_desc",
      page: 1,
      limit: 25,
    }),
    errorLogs: await listOpsErrorLogs(t.serviceDb, { type: "all", limit: 50 }),
  };

  // Guard the guard: if the seeding above silently stopped producing rows,
  // an empty response would pass the leak assertion for the wrong reason.
  expect((payloads.gamesRequested as { items: unknown[] }).items).toHaveLength(1);
  expect((payloads.gamesDeclinedSoft as { items: unknown[] }).items).toHaveLength(1);
  expect((payloads.accounts as { items: unknown[] }).items.length).toBeGreaterThanOrEqual(2);
  expect((payloads.errorLogs as { items: unknown[] }).items.length).toBeGreaterThan(0);
  expect((payloads.gameStats as { created: { total: number } }).created.total).toBe(2);
  expect(pending.id).toBeTruthy();

  // The tripwire itself: no sealed field of any table may reach an ops caller.
  const serialized = JSON.stringify(payloads);
  expect(serialized).not.toContain("enc:v1:");
  expect(serialized).not.toContain("secret-title");
  expect(serialized).not.toContain("secret-description");
  expect(serialized).not.toContain("secret-bundle");
}, 60_000);
