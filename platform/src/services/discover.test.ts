import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { GameInsert } from "@dodi/types/database";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";

import {
  getGameStats,
  getPublishedGame,
  getPublishedGameDetail,
  getPublishedGamesByIds,
  listPublishedGames,
  listPublishedGameCatalog,
  listRandomPublishedGameSummaries,
} from "./discover";

/** The two seeded system games (dodi's own published rows). */
const SYSTEM_DRAWING = "560b130f-80a6-4353-a750-deac44224c53";
const SYSTEM_MANDALA = "00079709-ce39-4669-98e8-a3181640b4fb";

const SOURCE = "0d15c0de-0000-4000-8000-000000000005";
const PUB_1 = "0d15c0de-0000-4000-8000-000000000001";
const PUB_2 = "0d15c0de-0000-4000-8000-000000000002";
const PENDING = "0d15c0de-0000-4000-8000-000000000003";
const PRIVATE = "0d15c0de-0000-4000-8000-000000000004";
const MISSING = "0d15c0de-0000-4000-8000-0000000000ff";

let t: TestDatabase;
let publisher: string;
let publisherKid: string;
let versionId: string;

/**
 * Real rows carry every publisher field a projected read must never fetch,
 * which is what makes the assertions here meaningful for the projections and
 * for `toPublicGame`'s belt-and-suspenders nulling.
 */
function publishedRow(overrides: Partial<GameInsert> = {}): GameInsert {
  return {
    id: PUB_1,
    account_id: publisher,
    kid_id: publisherKid,
    published_by_account_id: publisher,
    agent_transcript_enc: "enc:v1:k1:aaa:bbb",
    current_game_version_id: versionId,
    source_game_id: null,
    system_key: null,
    is_system: false,
    is_active: false,
    title: "Counting Comets",
    description: "Count the comets",
    tags: ["math"],
    target_age_min: 5,
    target_age_max: 8,
    estimated_duration_minutes: 10,
    progress_kind: "goal",
    preview_image: null,
    code_bundle: "<html><body>hi</body></html>",
    markdown: "# Briefing",
    learning_goal: "Count to ten",
    success_definition: "3 sums",
    success_criteria: { description: "3 sums" },
    metadata: {},
    created_by: "parent",
    publication_requested_at: "2026-07-01T10:00:00Z",
    published_at: "2026-07-02T10:00:00Z",
    approved_by: "system",
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-02T10:00:00Z",
    ...overrides,
  };
}

beforeAll(async () => {
  t = await createTestDb();
  publisher = await t.createAccount("publisher@example.com");
  await t.serviceDb
    .updateTable("accounts")
    .set({ publication_handle: "fun_games" })
    .where("id", "=", publisher)
    .execute();
  const kid = await t.serviceDb
    .insertInto("kids")
    .values({ account_id: publisher, display_name: "enc:v1:kid", social_id: "kid-pub" })
    .returning("id")
    .executeTakeFirstOrThrow();
  publisherKid = kid.id;
});

afterAll(async () => {
  await t.close();
});

beforeEach(async () => {
  await t.serviceDb.deleteFrom("game_plays").execute();
  await t.serviceDb.deleteFrom("games").where("is_system", "=", false).execute();
  // The private source game with one version row: the publication copy points
  // at both so the nulling of owner fields is exercised on real references.
  await t.serviceDb
    .insertInto("games")
    .values({
      id: SOURCE,
      account_id: publisher,
      kid_id: publisherKid,
      title: "enc:v1:k1:title",
      code_bundle: "enc:v1:k1:code",
      created_by: "parent",
      progress_kind: "goal",
    })
    .execute();
  const version = await t.serviceDb
    .insertInto("game_versions")
    .values({ game_id: SOURCE, account_id: publisher, code_bundle: "enc:v1:k1:code" })
    .returning("id")
    .executeTakeFirstOrThrow();
  versionId = version.id;
  await t.serviceDb
    .insertInto("games")
    .values([
      publishedRow({ source_game_id: SOURCE }),
      publishedRow({ id: PUB_2, published_at: "2026-07-10T10:00:00Z" }),
      // A pending (not yet published) submission and a private game.
      publishedRow({ id: PENDING, published_at: null, approved_by: null }),
      publishedRow({
        id: PRIVATE,
        published_at: null,
        approved_by: null,
        publication_requested_at: null,
      }),
    ])
    .execute();
});

describe("listPublishedGames", () => {
  it("lists only LIVE games, newest first, with the byline", async () => {
    const rows = await listPublishedGames(t.serviceDb);
    expect(rows.map((r) => r.id)).toEqual([
      PUB_2,
      PUB_1,
      SYSTEM_MANDALA,
      SYSTEM_DRAWING,
    ]);
    expect(rows[0].publication_handle).toBe("fun_games");
  });

  it("paginates by published_at cursor", async () => {
    const rows = await listPublishedGames(t.serviceDb, {
      cursor: "2026-07-10T10:00:00Z",
    });
    expect(rows.map((r) => r.id)).toEqual([PUB_1, SYSTEM_MANDALA, SYSTEM_DRAWING]);
  });

  it("lists dodi's system rows like any publication: flagged, no byline", async () => {
    const rows = await listPublishedGames(t.serviceDb);
    const system = rows.filter((r) => r.is_system);
    expect(system.map((r) => r.id).sort()).toEqual(
      [SYSTEM_DRAWING, SYSTEM_MANDALA].sort(),
    );
    for (const row of system) expect(row.publication_handle).toBeNull();
  });

  it("never exposes publisher ids in the summary shape", async () => {
    const rows = await listPublishedGames(t.serviceDb);
    for (const row of rows) {
      expect(row).not.toHaveProperty("account_id");
      expect(row).not.toHaveProperty("kid_id");
      expect(row).not.toHaveProperty("published_by_account_id");
      expect(row).not.toHaveProperty("agent_transcript_enc");
      expect(row).not.toHaveProperty("code_bundle");
      expect(row).not.toHaveProperty("author");
    }
  });
});

describe("listRandomPublishedGameSummaries", () => {
  const LIVE = [PUB_1, PUB_2, SYSTEM_DRAWING, SYSTEM_MANDALA].sort();

  it("samples only LIVE games, honoring the limit", async () => {
    const rows = await listRandomPublishedGameSummaries(t.serviceDb, 1);
    expect(rows).toHaveLength(1);
    expect(LIVE).toContain(rows[0].id);
  });

  it("is deterministic under an injected rng", async () => {
    const first = await listRandomPublishedGameSummaries(t.serviceDb, 4, () => 0.99);
    const second = await listRandomPublishedGameSummaries(t.serviceDb, 4, () => 0.99);
    expect(first.map((r) => r.id)).toEqual(second.map((r) => r.id));
    expect(first.map((r) => r.id).sort()).toEqual(LIVE);
  });

  it("returns the whole catalog when limit exceeds it", async () => {
    const rows = await listRandomPublishedGameSummaries(t.serviceDb, 10);
    expect(rows.map((r) => r.id).sort()).toEqual(LIVE);
  });

  it("returns [] for an empty catalog", async () => {
    // Unpublish everything (system rows included) and restore them after.
    await t.serviceDb.updateTable("games").set({ published_at: null }).execute();
    try {
      await expect(
        listRandomPublishedGameSummaries(t.serviceDb, 10),
      ).resolves.toEqual([]);
    } finally {
      await t.serviceDb
        .updateTable("games")
        .set({ published_at: "2026-03-06T16:44:19.288505Z" })
        .where("id", "=", SYSTEM_DRAWING)
        .execute();
      await t.serviceDb
        .updateTable("games")
        .set({ published_at: "2026-03-06T16:44:20.288505Z" })
        .where("id", "=", SYSTEM_MANDALA)
        .execute();
    }
  });

  it("never exposes publisher ids or content in the summary shape", async () => {
    const rows = await listRandomPublishedGameSummaries(t.serviceDb, 10);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row).not.toHaveProperty("account_id");
      expect(row).not.toHaveProperty("kid_id");
      expect(row).not.toHaveProperty("published_by_account_id");
      expect(row).not.toHaveProperty("agent_transcript_enc");
      expect(row).not.toHaveProperty("code_bundle");
    }
  });

  it("maps the byline for parent publications and system rows", async () => {
    const rows = await listRandomPublishedGameSummaries(t.serviceDb, 10);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(PUB_1)?.publication_handle).toBe("fun_games");
    expect(byId.get(SYSTEM_DRAWING)?.publication_handle).toBeNull();
    expect(byId.get(SYSTEM_DRAWING)?.is_system).toBe(true);
  });
});

describe("listPublishedGameCatalog", () => {
  it("returns every LIVE game, newest first, with updated_at", async () => {
    const games = await listPublishedGameCatalog(t.serviceDb);
    expect(games.map((g) => g.id)).toEqual([
      PUB_2,
      PUB_1,
      SYSTEM_MANDALA,
      SYSTEM_DRAWING,
    ]);
    expect(games[0]).toMatchObject({
      id: PUB_2,
      title: "Counting Comets",
      tags: ["math"],
      publication_handle: "fun_games",
      published_at: "2026-07-10T10:00:00.000Z",
      updated_at: "2026-07-02T10:00:00.000Z",
    });
  });

  it("carries the public summary fields plus updated_at, never publisher ids or content", async () => {
    const games = await listPublishedGameCatalog(t.serviceDb);
    for (const game of games) {
      expect(Object.keys(game).sort()).toEqual([
        "available_locales",
        "description",
        "estimated_duration_minutes",
        "id",
        "is_system",
        "preview_image",
        "progress_kind",
        "publication_handle",
        "published_at",
        "tags",
        "target_age_max",
        "target_age_min",
        "title",
        "updated_at",
      ]);
    }
  });
});

describe("getPublishedGameDetail", () => {
  it("returns the full content for a LIVE game, without publisher ids", async () => {
    const detail = await getPublishedGameDetail(t.serviceDb, PUB_1);
    expect(detail?.code_bundle).toContain("<html>");
    expect(detail?.publication_handle).toBe("fun_games");
    expect(detail).not.toHaveProperty("account_id");
    expect(detail).not.toHaveProperty("published_by_account_id");
    expect(detail).not.toHaveProperty("author");
  });

  it("returns null for pending and private rows", async () => {
    await expect(getPublishedGameDetail(t.serviceDb, PENDING)).resolves.toBeNull();
    await expect(getPublishedGameDetail(t.serviceDb, PRIVATE)).resolves.toBeNull();
  });
});

describe("getPublishedGame(s): the playable Game shape", () => {
  it("nulls every owner field on the way out", async () => {
    const game = await getPublishedGame(t.serviceDb, PUB_1);
    expect(game).toMatchObject({
      id: PUB_1,
      account_id: null,
      kid_id: null,
      published_by_account_id: null,
      agent_transcript_enc: null,
      current_game_version_id: null,
      source_game_id: null,
    });
    // Still recognizably a plaintext publication row for the client predicate.
    expect(game?.publication_requested_at).toBeTruthy();
    expect(game?.published_at).toBeTruthy();
  });

  it("returns null for anything not LIVE", async () => {
    await expect(getPublishedGame(t.serviceDb, PENDING)).resolves.toBeNull();
    await expect(getPublishedGame(t.serviceDb, PRIVATE)).resolves.toBeNull();
  });

  it("getPublishedGamesByIds drops ids that are not published", async () => {
    const games = await getPublishedGamesByIds(t.serviceDb, [
      PUB_1,
      PENDING,
      MISSING,
    ]);
    expect(games.map((g) => g.id)).toEqual([PUB_1]);
    expect(games[0].account_id).toBeNull();
  });

  it("getPublishedGamesByIds short-circuits on an empty id list", async () => {
    await expect(getPublishedGamesByIds(t.serviceDb, [])).resolves.toEqual([]);
  });
});

describe("getGameStats", () => {
  it("aggregates plays on the published row and remixes pointing back at it", async () => {
    await t.serviceDb
      .insertInto("game_plays")
      .values([
        { account_id: publisher, kid_id: publisherKid, game_id: PUB_1, progress_kind: "goal" },
        { account_id: publisher, kid_id: publisherKid, game_id: PUB_1, progress_kind: "goal" },
      ])
      .execute();
    // A private remix of PUB_1 (source_game_id set, no publication request).
    await t.serviceDb
      .insertInto("games")
      .values({
        account_id: publisher,
        kid_id: publisherKid,
        source_game_id: PUB_1,
        title: "enc:v1:k1:remix",
        code_bundle: "enc:v1:k1:code",
        created_by: "parent",
        progress_kind: "goal",
      })
      .execute();

    const stats = await getGameStats(t.serviceDb, [PUB_1, PUB_2]);
    expect(stats.get(PUB_1)).toEqual({ plays: 2, copies: 1 });
    expect(stats.get(PUB_2)).toEqual({ plays: 0, copies: 0 });
  });

  it("does not count a publication copy as a remix", async () => {
    // PUB_1 is the publication copy of SOURCE: a submission, not a copy.
    const stats = await getGameStats(t.serviceDb, [SOURCE]);
    expect(stats.get(SOURCE)).toEqual({ plays: 0, copies: 0 });
  });

  it("short-circuits (no query) on an empty id list", async () => {
    const stats = await getGameStats(t.serviceDb, []);
    expect(stats.size).toBe(0);
  });
});
