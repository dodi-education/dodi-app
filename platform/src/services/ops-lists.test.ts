import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { GameInsert, Json } from "@dodi/types/database";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";

import {
  listOpsAccounts,
  listOpsGames,
  OpsAccountsQuerySchema,
  OpsGamesQuerySchema,
} from "./ops-lists";

/** The two system games the baseline migration ships. */
const SYSTEM_DRAWING = "560b130f-80a6-4353-a750-deac44224c53";
const SYSTEM_MANDALA = "00079709-ce39-4669-98e8-a3181640b4fb";

const PRIVATE_GAME = "0d15c0de-2000-4000-8000-000000000001";
const PUB_PENDING = "0d15c0de-2000-4000-8000-000000000002";
const PUB_PUBLISHED = "0d15c0de-2000-4000-8000-000000000003";
const PUB_SOFT = "0d15c0de-2000-4000-8000-000000000004";
const PUB_HARD = "0d15c0de-2000-4000-8000-000000000005";

const LONG_DESCRIPTION = "x".repeat(400);

let t: TestDatabase;
let paidAccount: string;
let freeAccount: string;
let underscoreAccount: string;
let paidKid: string;

/** Default query objects, parsed through the real schemas. */
const accountsQuery = (overrides: Record<string, string> = {}) =>
  OpsAccountsQuerySchema.parse(overrides);
const gamesQuery = (overrides: Record<string, string> = {}) =>
  OpsGamesQuerySchema.parse(overrides);

function game(overrides: Partial<GameInsert> & { id: string }): GameInsert {
  return {
    account_id: paidAccount,
    is_system: false,
    title: "plaintext title",
    description: "plaintext description",
    code_bundle: "<html></html>",
    tags: [],
    created_by: "parent",
    created_at: "2026-05-10T10:00:00Z",
    updated_at: "2026-05-10T10:00:00Z",
    ...overrides,
  };
}

beforeAll(async () => {
  t = await createTestDb();

  paidAccount = await t.createAccount("a_b@example.com");
  freeAccount = await t.createAccount("axb@example.com");
  underscoreAccount = await t.createAccount("third@example.com");

  await t.serviceDb
    .updateTable("auth_users")
    .set({ name: "Paid Parent" })
    .where("id", "=", paidAccount)
    .execute();
  await t.serviceDb
    .updateTable("auth_users")
    .set({ name: "" })
    .where("id", "=", freeAccount)
    .execute();

  await t.serviceDb
    .updateTable("accounts")
    .set({
      created_at: "2026-05-10T08:00:00Z",
      subscribed_plan: "hatchling",
      publication_handle: "fun_games",
      flagged_for_review_at: "2026-05-12T08:00:00Z",
      model_config: {
        voiceProvider: "dodi",
        voiceModel: "think-fast-1.0",
        voiceName: "ara",
        gameProvider: "anthropic",
      } as unknown as Json,
    })
    .where("id", "=", paidAccount)
    .execute();
  await t.serviceDb
    .updateTable("accounts")
    .set({
      created_at: "2026-05-09T08:00:00Z",
      model_config: { voiceProvider: "gemini" } as unknown as Json,
    })
    .where("id", "=", freeAccount)
    .execute();
  await t.serviceDb
    .updateTable("accounts")
    .set({ created_at: "2026-05-08T08:00:00Z" })
    .where("id", "=", underscoreAccount)
    .execute();

  const kid = await t.serviceDb
    .insertInto("kids")
    .values({
      account_id: paidAccount,
      display_name: "enc:v1:kid",
      social_id: "kid-paid",
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  paidKid = kid.id;

  // lastActiveAt reads both sources: this account's newest signal is a session.
  await t.serviceDb
    .insertInto("activities")
    .values({
      account_id: paidAccount,
      kid_id: paidKid,
      event: "session_start",
      message: "started a session",
      occurred_at: "2026-05-11T09:00:00Z",
    })
    .execute();
  await t.serviceDb
    .insertInto("auth_sessions")
    .values({
      user_id: paidAccount,
      token: "session-token-paid",
      expires_at: "2026-06-13T10:00:00Z",
      created_at: "2026-05-13T10:00:00Z",
      updated_at: "2026-05-13T10:00:00Z",
    })
    .execute();

  await t.serviceDb
    .insertInto("games")
    .values([
      // E2EE private row: must never appear in the ops list.
      game({
        id: PRIVATE_GAME,
        title: "enc:v1:secret-title",
        description: "enc:v1:secret-description",
        code_bundle: "enc:v1:bundle",
        tags: ["math"],
      }),
      game({
        id: PUB_PENDING,
        title: "Counting Comets",
        description: LONG_DESCRIPTION,
        tags: ["ai", "math", "reading"],
        source_game_id: PRIVATE_GAME,
        published_by_account_id: paidAccount,
        publication_requested_at: "2026-05-11T10:00:00Z",
        review_attempts: 1,
      }),
      game({
        id: PUB_PUBLISHED,
        title: "Mandala Maker",
        description: "A calm colouring game",
        tags: ["drawing"],
        published_by_account_id: paidAccount,
        publication_requested_at: "2026-05-09T10:00:00Z",
        published_at: "2026-05-13T10:00:00Z",
        approved_by: "admin",
        available_locales: ["en", "de"],
      }),
      game({
        id: PUB_SOFT,
        title: "Soft Rejected",
        description: "needs work",
        account_id: freeAccount,
        published_by_account_id: freeAccount,
        publication_requested_at: "2026-05-08T10:00:00Z",
        rejected_at: "2026-05-12T10:00:00Z",
        rejection_kind: "soft",
        rejection_reasons: [
          { code: "soft_quality_below_bar", note: "dead ends" },
          "not-an-object",
          { note: "no code" },
        ] as unknown as Json,
      }),
      game({
        id: PUB_HARD,
        title: "Hard Rejected",
        description: "no",
        account_id: freeAccount,
        published_by_account_id: freeAccount,
        publication_requested_at: "2026-05-07T10:00:00Z",
        rejected_at: "2026-05-12T11:00:00Z",
        rejection_kind: "hard",
      }),
    ])
    .execute();

  await t.serviceDb
    .insertInto("game_plays")
    .values([
      {
        account_id: paidAccount,
        kid_id: paidKid,
        game_id: PUB_PUBLISHED,
        created_at: "2026-05-13T11:00:00Z",
        started_at: "2026-05-13T11:00:00Z",
      },
      {
        account_id: paidAccount,
        kid_id: paidKid,
        game_id: PUB_PUBLISHED,
        created_at: "2026-05-13T12:00:00Z",
        started_at: "2026-05-13T12:00:00Z",
      },
    ])
    .execute();
});

afterAll(async () => {
  await t.close();
});

describe("listOpsAccounts", () => {
  it("projects the plaintext operational columns", async () => {
    const page = await listOpsAccounts(t.serviceDb, accountsQuery());
    expect(page.totals).toEqual({ accounts: 3, kids: 1 });
    expect(page.total).toBe(3);
    expect(page.page).toBe(1);
    expect(page.limit).toBe(25);
    expect(page.unavailable).toBeUndefined();

    const paid = page.items.find((item) => item.id === paidAccount);
    expect(paid).toEqual({
      id: paidAccount,
      email: "a_b@example.com",
      name: "Paid Parent",
      createdAt: "2026-05-10T08:00:00.000Z",
      plan: { handle: "hatchling", title: "Hatchling", priceEurMonth: 9 },
      status: "paid",
      mrrEur: 9,
      kidsCount: 1,
      aiProviders: {
        voice: "dodi",
        thinking: null,
        game: "anthropic",
        image: null,
      },
      aiSummary: "mixed",
      // The newest of the activity and the session, not just one source.
      lastActiveAt: "2026-05-13T10:00:00.000Z",
      flaggedForReviewAt: "2026-05-12T08:00:00.000Z",
      publicationHandle: "fun_games",
    });
  });

  it("summarizes the AI setup per account", async () => {
    const page = await listOpsAccounts(t.serviceDb, accountsQuery());
    const byId = new Map(page.items.map((item) => [item.id, item]));
    expect(byId.get(freeAccount)?.aiSummary).toBe("byok");
    expect(byId.get(underscoreAccount)?.aiSummary).toBe("unset");
    expect(byId.get(underscoreAccount)?.lastActiveAt).toBeNull();
    expect(byId.get(freeAccount)?.name).toBe("");
  });

  it("orders newest first and pages", async () => {
    const first = await listOpsAccounts(
      t.serviceDb,
      accountsQuery({ limit: "1", page: "1" }),
    );
    expect(first.items.map((i) => i.id)).toEqual([paidAccount]);
    expect(first.total).toBe(3);
    const second = await listOpsAccounts(
      t.serviceDb,
      accountsQuery({ limit: "1", page: "2" }),
    );
    expect(second.items.map((i) => i.id)).toEqual([freeAccount]);
  });

  it("treats ilike wildcards in the search term as literals", async () => {
    const page = await listOpsAccounts(
      t.serviceDb,
      accountsQuery({ query: "a_b" }),
    );
    expect(page.items.map((i) => i.email)).toEqual(["a_b@example.com"]);
    const byName = await listOpsAccounts(
      t.serviceDb,
      accountsQuery({ query: "paid par" }),
    );
    expect(byName.items.map((i) => i.id)).toEqual([paidAccount]);
  });

  it("filters by plan and by paid/free status", async () => {
    const hatchling = await listOpsAccounts(
      t.serviceDb,
      accountsQuery({ plan: "hatchling" }),
    );
    expect(hatchling.items.map((i) => i.id)).toEqual([paidAccount]);

    const paid = await listOpsAccounts(
      t.serviceDb,
      accountsQuery({ status: "paid" }),
    );
    expect(paid.items.map((i) => i.id)).toEqual([paidAccount]);

    const free = await listOpsAccounts(
      t.serviceDb,
      accountsQuery({ status: "free" }),
    );
    expect(free.total).toBe(2);
    expect(free.items.every((i) => i.status === "free")).toBe(true);
  });

  it("answers trial and past_due with an empty page and an unavailable marker", async () => {
    for (const status of ["trial", "past_due"]) {
      const page = await listOpsAccounts(t.serviceDb, accountsQuery({ status }));
      expect(page.unavailable).toBe("billing");
      expect(page.items).toEqual([]);
      expect(page.total).toBe(0);
      // The header totals stay meaningful.
      expect(page.totals).toEqual({ accounts: 3, kids: 1 });
    }
  });
});

describe("listOpsGames", () => {
  it("never returns an E2EE private game", async () => {
    const page = await listOpsGames(t.serviceDb, gamesQuery({ limit: "100" }));
    expect(page.items.some((item) => item.id === PRIVATE_GAME)).toBe(false);
    // 2 system games + 4 publication copies.
    expect(page.total).toBe(6);
    const search = await listOpsGames(
      t.serviceDb,
      gamesQuery({ query: "enc:v1" }),
    );
    expect(search.items).toEqual([]);
  });

  it("shapes a publication copy row", async () => {
    const page = await listOpsGames(
      t.serviceDb,
      gamesQuery({ query: "Counting Comets" }),
    );
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toEqual({
      id: PUB_PENDING,
      title: "Counting Comets",
      description: `${"x".repeat(159)}…`,
      creator: {
        kind: "parent",
        handle: "fun_games",
        accountId: paidAccount,
        email: "a_b@example.com",
      },
      // `ai` is a capability tag, so the category is the first subject tag.
      category: "math",
      tags: ["ai", "math", "reading"],
      state: "requested",
      isSystem: false,
      plays: 0,
      submittedAt: "2026-05-11T10:00:00.000Z",
      publishedAt: null,
      rejectedAt: null,
      rejectionKind: null,
      rejectionReasons: [],
      reviewAttempts: 1,
      availableLocales: null,
      createdAt: "2026-05-10T10:00:00.000Z",
    });
  });

  it("marks system rows as the system creator", async () => {
    const page = await listOpsGames(t.serviceDb, gamesQuery({ limit: "100" }));
    const drawing = page.items.find((item) => item.id === SYSTEM_DRAWING);
    expect(drawing?.creator).toEqual({
      kind: "system",
      handle: null,
      accountId: null,
      email: null,
    });
    expect(drawing?.state).toBe("published");
    expect(drawing?.isSystem).toBe(true);
    expect(drawing?.category).toBe("drawing");
    expect(page.items.some((item) => item.id === SYSTEM_MANDALA)).toBe(true);
  });

  it("derives the four states and filters on them", async () => {
    const published = await listOpsGames(
      t.serviceDb,
      gamesQuery({ state: "published", limit: "100" }),
    );
    expect(published.items.map((i) => i.id).sort()).toEqual(
      [SYSTEM_MANDALA, SYSTEM_DRAWING, PUB_PUBLISHED].sort(),
    );

    const requested = await listOpsGames(
      t.serviceDb,
      gamesQuery({ state: "requested" }),
    );
    expect(requested.items.map((i) => i.id)).toEqual([PUB_PENDING]);

    const soft = await listOpsGames(
      t.serviceDb,
      gamesQuery({ state: "declined_soft" }),
    );
    expect(soft.items.map((i) => i.id)).toEqual([PUB_SOFT]);
    expect(soft.items[0].state).toBe("declined_soft");
    // Malformed jsonb entries are dropped, well-formed ones survive.
    expect(soft.items[0].rejectionReasons).toEqual([
      { code: "soft_quality_below_bar", note: "dead ends" },
    ]);

    const hard = await listOpsGames(
      t.serviceDb,
      gamesQuery({ state: "declined_hard" }),
    );
    expect(hard.items.map((i) => i.id)).toEqual([PUB_HARD]);
    expect(hard.items[0].state).toBe("declined_hard");
  });

  it("counts plays per game", async () => {
    const page = await listOpsGames(
      t.serviceDb,
      gamesQuery({ sort: "plays_desc", limit: "100" }),
    );
    expect(page.items[0].id).toBe(PUB_PUBLISHED);
    expect(page.items[0].plays).toBe(2);
    expect(page.items[0].availableLocales).toEqual(["en", "de"]);
  });

  it("sorts by submission and by rejection date", async () => {
    const submitted = await listOpsGames(
      t.serviceDb,
      gamesQuery({ sort: "submitted_desc", limit: "100" }),
    );
    expect(submitted.items.slice(0, 4).map((i) => i.id)).toEqual([
      PUB_PENDING,
      PUB_PUBLISHED,
      PUB_SOFT,
      PUB_HARD,
    ]);

    const rejected = await listOpsGames(
      t.serviceDb,
      gamesQuery({ sort: "rejected_desc", limit: "100" }),
    );
    expect(rejected.items.slice(0, 2).map((i) => i.id)).toEqual([
      PUB_HARD,
      PUB_SOFT,
    ]);
  });

  it("reports catalog totals", async () => {
    const page = await listOpsGames(t.serviceDb, gamesQuery());
    expect(page.totals).toEqual({ published: 3, openRequests: 1 });
  });
});
