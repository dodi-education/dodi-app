import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GameInsert, Json } from "@dodi/types/database";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";

import { resolveOpsRange, type OpsRange } from "./ops-range";
import {
  getOpsAiRequestShare,
  getOpsGameStats,
  getOpsKpis,
} from "./ops-stats";

/** Fixed clock: the 7d window runs 2026-05-08 (incl.) .. 2026-05-15 (excl.). */
const NOW = new Date("2026-05-14T12:00:00Z");

const GAME_MATH = "0d15c0de-1000-4000-8000-000000000001";
const GAME_CAPABILITY_ONLY = "0d15c0de-1000-4000-8000-000000000002";
const GAME_B = "0d15c0de-1000-4000-8000-000000000003";
const GAME_OLD = "0d15c0de-1000-4000-8000-000000000004";
const PUB_PENDING = "0d15c0de-1000-4000-8000-000000000010";
const PUB_PARKED = "0d15c0de-1000-4000-8000-000000000011";
const PUB_APPROVED = "0d15c0de-1000-4000-8000-000000000012";
const PUB_SOFT = "0d15c0de-1000-4000-8000-000000000013";
const PUB_HARD = "0d15c0de-1000-4000-8000-000000000014";

let t: TestDatabase;
let range: OpsRange;
let accountA: string;
let accountB: string;
let kidA: string;
let kidB: string;

function game(overrides: Partial<GameInsert> & { id: string }): GameInsert {
  return {
    account_id: accountA,
    is_system: false,
    title: "enc:v1:title",
    description: "enc:v1:description",
    code_bundle: "enc:v1:bundle",
    tags: [],
    created_by: "parent",
    created_at: "2026-05-10T10:00:00Z",
    updated_at: "2026-05-10T10:00:00Z",
    ...overrides,
  };
}

beforeAll(async () => {
  t = await createTestDb();
  range = resolveOpsRange("7d", NOW);

  accountA = await t.createAccount("a@example.com");
  accountB = await t.createAccount("b@example.com");
  const accountC = await t.createAccount("old@example.com");

  // Signup dates: two inside the window, one long before it.
  await t.serviceDb
    .updateTable("accounts")
    .set({
      created_at: "2026-05-10T08:00:00Z",
      subscribed_plan: "hatchling",
      model_config: {
        voiceProvider: "dodi",
        voiceModel: "think-fast-1.0",
        voiceName: "ara",
        thinkingProvider: "anthropic",
      } as unknown as Json,
    })
    .where("id", "=", accountA)
    .execute();
  await t.serviceDb
    .updateTable("accounts")
    .set({
      created_at: "2026-05-12T08:00:00Z",
      model_config: { voiceProvider: "gemini" } as unknown as Json,
    })
    .where("id", "=", accountB)
    .execute();
  await t.serviceDb
    .updateTable("accounts")
    .set({ created_at: "2026-01-04T08:00:00Z" })
    .where("id", "=", accountC)
    .execute();

  const a = await t.serviceDb
    .insertInto("kids")
    .values({
      account_id: accountA,
      display_name: "enc:v1:kid-a",
      social_id: "kid-a",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  kidA = a.id;
  const b = await t.serviceDb
    .insertInto("kids")
    .values({
      account_id: accountB,
      display_name: "enc:v1:kid-b",
      social_id: "kid-b",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  kidB = b.id;

  await t.serviceDb
    .insertInto("games")
    .values([
      game({ id: GAME_MATH, tags: ["math", "ai"] }),
      // Only a capability tag: counts as untagged for the category breakdown.
      game({ id: GAME_CAPABILITY_ONLY, tags: ["ai"] }),
      game({
        id: GAME_B,
        account_id: accountB,
        tags: ["math", "reading"],
        created_at: "2026-05-11T10:00:00Z",
      }),
      // Before the window: never counted as created.
      game({ id: GAME_OLD, tags: ["music"], created_at: "2026-01-02T10:00:00Z" }),
      // Publication copies are plaintext and are never "created" games.
      game({
        id: PUB_PENDING,
        title: "Pending copy",
        description: "plaintext",
        code_bundle: "<html></html>",
        source_game_id: GAME_MATH,
        published_by_account_id: accountA,
        publication_requested_at: "2026-05-11T10:00:00Z",
      }),
      game({
        id: PUB_PARKED,
        title: "Parked copy",
        description: "plaintext",
        code_bundle: "<html></html>",
        published_by_account_id: accountA,
        publication_requested_at: "2026-05-09T10:00:00Z",
        review_attempts: 3,
      }),
      game({
        id: PUB_APPROVED,
        title: "Approved copy",
        description: "plaintext",
        code_bundle: "<html></html>",
        published_by_account_id: accountA,
        publication_requested_at: "2026-05-09T10:00:00Z",
        published_at: "2026-05-13T10:00:00Z",
        approved_by: "system",
      }),
      game({
        id: PUB_SOFT,
        title: "Soft rejected copy",
        description: "plaintext",
        code_bundle: "<html></html>",
        published_by_account_id: accountB,
        account_id: accountB,
        publication_requested_at: "2026-05-09T10:00:00Z",
        rejected_at: "2026-05-12T10:00:00Z",
        rejection_kind: "soft",
      }),
      game({
        id: PUB_HARD,
        title: "Hard rejected copy",
        description: "plaintext",
        code_bundle: "<html></html>",
        published_by_account_id: accountB,
        account_id: accountB,
        publication_requested_at: "2026-05-09T10:00:00Z",
        rejected_at: "2026-05-12T11:00:00Z",
        rejection_kind: "hard",
      }),
    ])
    .execute();

  await t.serviceDb
    .insertInto("game_plays")
    .values([
      {
        account_id: accountA,
        kid_id: kidA,
        game_id: GAME_MATH,
        created_at: "2026-05-10T10:00:00Z",
        started_at: "2026-05-10T10:00:00Z",
        ended_at: "2026-05-10T10:05:00Z",
      },
      {
        account_id: accountA,
        kid_id: kidA,
        game_id: GAME_MATH,
        created_at: "2026-05-10T11:00:00Z",
        started_at: "2026-05-10T11:00:00Z",
        ended_at: "2026-05-10T11:10:00Z",
      },
      {
        account_id: accountB,
        kid_id: kidB,
        game_id: GAME_B,
        created_at: "2026-05-11T10:00:00Z",
        started_at: "2026-05-11T10:00:00Z",
        ended_at: "2026-05-11T10:03:20Z",
      },
    ])
    .execute();

  await t.serviceDb
    .insertInto("activities")
    .values([
      {
        account_id: accountA,
        kid_id: kidA,
        event: "session_start",
        message: "started a session",
        occurred_at: "2026-05-11T09:00:00Z",
      },
      // Same kid, same day as its game play: must not double-count.
      {
        account_id: accountB,
        kid_id: kidB,
        event: "game_started",
        message: "started a game",
        occurred_at: "2026-05-11T10:30:00Z",
      },
      // Ignored event type.
      {
        account_id: accountB,
        kid_id: kidB,
        event: "memory_updated",
        message: "memory",
        occurred_at: "2026-05-13T10:30:00Z",
      },
    ])
    .execute();

  await t.serviceDb
    .insertInto("ai_usage_logs")
    .values([
      {
        account_id: accountA,
        event_type: "voice_minutes",
        provider: "xai",
        model: "think-fast-1.0",
        voice_seconds: 120,
        created_at: "2026-05-10T10:00:00Z",
      },
      {
        account_id: accountA,
        event_type: "game_create",
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        created_at: "2026-05-10T11:00:00Z",
      },
      {
        account_id: accountB,
        event_type: "voice_minutes",
        provider: "gemini",
        model: "gemini-live",
        voice_seconds: 60,
        created_at: "2026-05-11T10:00:00Z",
      },
      // Outside the window.
      {
        account_id: accountB,
        event_type: "voice_minutes",
        provider: "gemini",
        model: "gemini-live",
        voice_seconds: 999,
        created_at: "2026-01-11T10:00:00Z",
      },
    ])
    .execute();

  await t.serviceDb
    .insertInto("error_logs")
    .values([
      {
        type: "server",
        context: "api/games#POST",
        created_at: "2026-05-10T10:00:00Z",
      },
      {
        type: "server",
        context: "api/kids#GET",
        created_at: "2026-05-11T10:00:00Z",
      },
      {
        type: "client",
        context: "game_build",
        created_at: "2026-05-11T10:00:00Z",
      },
      {
        type: "server",
        context: "api/games#POST",
        created_at: "2026-01-11T10:00:00Z",
      },
    ])
    .execute();
});

afterAll(async () => {
  await t.close();
});

describe("getOpsKpis", () => {
  it("returns one bucket per day of the window", async () => {
    const kpis = await getOpsKpis(t.serviceDb, range);
    expect(kpis.range).toEqual(range);
    expect(kpis.newSignups.daily).toHaveLength(7);
    expect(kpis.activeKids.daily).toHaveLength(7);
    expect(kpis.avgSessionSeconds.daily).toHaveLength(7);
    expect(kpis.trialToPaid).toBeNull();
    expect(kpis.churn).toBeNull();
  });

  it("counts signups inside the window only", async () => {
    const kpis = await getOpsKpis(t.serviceDb, range);
    expect(kpis.newSignups.current).toBe(2);
    expect(kpis.newSignups.previous).toBe(0);
    expect(kpis.newSignups.daily).toEqual([
      { day: "2026-05-08", value: 0 },
      { day: "2026-05-09", value: 0 },
      { day: "2026-05-10", value: 1 },
      { day: "2026-05-11", value: 0 },
      { day: "2026-05-12", value: 1 },
      { day: "2026-05-13", value: 0 },
      { day: "2026-05-14", value: 0 },
    ]);
  });

  it("counts a kid once per day across plays and activities", async () => {
    const kpis = await getOpsKpis(t.serviceDb, range);
    const byDay = new Map(kpis.activeKids.daily.map((p) => [p.day, p.value]));
    // Only kid A played on the 10th.
    expect(byDay.get("2026-05-10")).toBe(1);
    // Kid A (activity) + kid B (play AND activity, deduped) on the 11th.
    expect(byDay.get("2026-05-11")).toBe(2);
    // memory_updated is not an activity signal.
    expect(byDay.get("2026-05-13")).toBe(0);
    // Average distinct kids per day: 3 kid-days over 7 buckets.
    expect(kpis.activeKids.current).toBe(0.43);
  });

  it("averages summed play duration per kid-day", async () => {
    const kpis = await getOpsKpis(t.serviceDb, range);
    // Kid A on the 10th: 300 + 600 = 900. Kid B on the 11th: 200.
    expect(kpis.avgSessionSeconds.current).toBe(550);
    expect(kpis.avgSessionSeconds.previous).toBeNull();
    const byDay = new Map(
      kpis.avgSessionSeconds.daily.map((p) => [p.day, p.value]),
    );
    expect(byDay.get("2026-05-10")).toBe(900);
    expect(byDay.get("2026-05-11")).toBe(200);
  });

  it("derives MRR from the subscribed plan prices", async () => {
    const kpis = await getOpsKpis(t.serviceDb, range);
    expect(kpis.mrr.source).toBe("subscribed_plans");
    // Only account A is on hatchling (9 EUR); the other two are on the free egg.
    expect(kpis.mrr.currentEur).toBe(9);
    const hatchling = kpis.mrr.byPlan.find((p) => p.handle === "hatchling");
    expect(hatchling).toEqual({
      handle: "hatchling",
      title: "Hatchling",
      priceEurMonth: 9,
      accounts: 1,
    });
    expect(kpis.mrr.byPlan.find((p) => p.handle === "egg")?.accounts).toBe(2);
  });

  it("reports the activation funnel for the window's cohort", async () => {
    const kpis = await getOpsKpis(t.serviceDb, range);
    expect(kpis.funnel).toEqual({
      cohortAccounts: 2,
      withKid: 2,
      withPlay: 2,
      // Only account A routes a category through dodi AI.
      withDodiAi: 1,
    });
  });

  it("reports platform totals and in-range server errors", async () => {
    const kpis = await getOpsKpis(t.serviceDb, range);
    expect(kpis.totals.accounts).toBe(3);
    expect(kpis.totals.kids).toBe(2);
    // The two seeded system games plus the approved publication copy.
    expect(kpis.totals.publishedGames).toBe(3);
    // Pending + parked (parked is still pending).
    expect(kpis.totals.openPublicationRequests).toBe(2);
    expect(kpis.totals.serverErrorsInRange).toBe(2);
  });
});

describe("getOpsGameStats", () => {
  it("counts private games created in the window, excluding publication copies", async () => {
    const stats = await getOpsGameStats(t.serviceDb, range);
    expect(stats.created.total).toBe(3);
  });

  it("breaks created games down by subject tag, excluding capability tags", async () => {
    const stats = await getOpsGameStats(t.serviceDb, range);
    expect(stats.created.byTag).toEqual([
      { tag: "math", count: 2 },
      { tag: "reading", count: 1 },
    ]);
    // The game tagged only `ai` has no subject tag at all.
    expect(stats.created.untagged).toBe(1);
  });

  it("reports the share of created games that were replayed", async () => {
    const stats = await getOpsGameStats(t.serviceDb, range);
    // One of three created games has two or more plays.
    expect(stats.created.replayedShare).toBe(0.33);
  });

  it("is null for replayedShare when nothing was created", async () => {
    const empty = await getOpsGameStats(
      t.serviceDb,
      resolveOpsRange("7d", new Date("2026-02-14T12:00:00Z")),
    );
    expect(empty.created.total).toBe(0);
    expect(empty.created.replayedShare).toBeNull();
    expect(empty.created.byTag).toEqual([]);
  });

  it("counts the publication funnel", async () => {
    const stats = await getOpsGameStats(t.serviceDb, range);
    expect(stats.publications).toEqual({
      pending: 2,
      approvedInRange: 1,
      rejectedSoftInRange: 1,
      rejectedHardInRange: 1,
      parked: 1,
    });
  });
});

describe("getOpsAiRequestShare", () => {
  it("splits requests by provider and by dodi AI vs BYOK", async () => {
    const share = await getOpsAiRequestShare(t.serviceDb, range);
    expect(share.totalRequests).toBe(3);
    expect(share.voiceSeconds).toBe(180);
    expect(share.byProvider).toEqual([
      { provider: "anthropic", requests: 1, voiceSeconds: 0 },
      { provider: "gemini", requests: 1, voiceSeconds: 60 },
      { provider: "xai", requests: 1, voiceSeconds: 120 },
    ]);
    // Only account A's voice category is routed through dodi AI.
    expect(share.managedShare).toBe(0.33);
    expect(share.byokShare).toBe(0.67);
  });

  it("is null for both shares when the window has no requests", async () => {
    const share = await getOpsAiRequestShare(
      t.serviceDb,
      resolveOpsRange("7d", new Date("2026-02-14T12:00:00Z")),
    );
    expect(share.totalRequests).toBe(0);
    expect(share.managedShare).toBeNull();
    expect(share.byokShare).toBeNull();
  });
});
