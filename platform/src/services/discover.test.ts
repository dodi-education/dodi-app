import { beforeEach, describe, expect, it } from "vitest";

import { type Row, fakeDb } from "../test-support/fake-supabase";

import {
  getGameStats,
  getPublishedGame,
  getPublishedGameDetail,
  getPublishedGamesByIds,
  listPublishedGames,
  listPublishedSitemapEntries,
  listRandomPublishedGameSummaries,
} from "./discover";

/**
 * The fake builder ignores column projections, so every row below carries the
 * publisher fields a real projected read would never fetch — which makes the
 * assertions here meaningful for `toPublicGame`'s belt-and-suspenders nulling.
 * (The `author` embed is simulated as the joined object PostgREST returns.)
 */
function publishedRow(overrides: Row = {}): Row {
  return {
    id: "pub-1",
    account_id: "publisher-acc",
    kid_id: "publisher-kid",
    published_by_account_id: "publisher-acc",
    agent_transcript_enc: "enc:v1:k1:aaa:bbb",
    current_game_version_id: "ver-1",
    source_game_id: "game-1",
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
    author: { publication_handle: "fun_games" },
    created_at: "2026-07-01T10:00:00Z",
    updated_at: "2026-07-02T10:00:00Z",
    ...overrides,
  };
}

let db: ReturnType<typeof fakeDb<{ games: Row[] }>>;

beforeEach(() => {
  db = fakeDb({
    games: [
      publishedRow(),
      publishedRow({ id: "pub-2", published_at: "2026-07-10T10:00:00Z" }),
      // A pending (not yet published) submission and a private game.
      publishedRow({ id: "pending-1", published_at: null, approved_by: null }),
      publishedRow({
        id: "private-1",
        published_at: null,
        approved_by: null,
        publication_requested_at: null,
      }),
    ],
  });
});

describe("listPublishedGames", () => {
  it("lists only LIVE games, newest first, with the byline", async () => {
    const rows = await listPublishedGames(db.client);
    expect(rows.map((r) => r.id)).toEqual(["pub-2", "pub-1"]);
    expect(rows[0].publication_handle).toBe("fun_games");
  });

  it("paginates by published_at cursor", async () => {
    const rows = await listPublishedGames(db.client, {
      cursor: "2026-07-10T10:00:00Z",
    });
    expect(rows.map((r) => r.id)).toEqual(["pub-1"]);
  });

  it("lists dodi's system rows like any publication — flagged, no byline", async () => {
    db.tables.games.push(
      publishedRow({
        id: "sys-1",
        is_system: true,
        system_key: "drawing-basic",
        account_id: null,
        kid_id: null,
        published_by_account_id: null,
        publication_requested_at: null,
        approved_by: "system",
        published_at: "2026-07-11T10:00:00Z",
        author: null,
      }),
    );
    const rows = await listPublishedGames(db.client);
    expect(rows.map((r) => r.id)).toEqual(["sys-1", "pub-2", "pub-1"]);
    expect(rows[0].is_system).toBe(true);
    expect(rows[0].publication_handle).toBeNull();
  });

  it("never exposes publisher ids in the summary shape", async () => {
    const rows = await listPublishedGames(db.client);
    for (const row of rows as unknown as Row[]) {
      expect(row).not.toHaveProperty("account_id");
      expect(row).not.toHaveProperty("kid_id");
      expect(row).not.toHaveProperty("published_by_account_id");
      expect(row).not.toHaveProperty("agent_transcript_enc");
      expect(row).not.toHaveProperty("code_bundle");
    }
  });
});

describe("listRandomPublishedGameSummaries", () => {
  /** rng stub yielding a fixed sequence (repeating the last value). */
  function sequenceRng(values: number[]): () => number {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
  }

  it("samples only LIVE games, honoring the limit", async () => {
    const rows = await listRandomPublishedGameSummaries(db.client, 1);
    expect(rows).toHaveLength(1);
    expect(["pub-1", "pub-2"]).toContain(rows[0].id);
  });

  it("is deterministic under an injected rng", async () => {
    // Pool is [pub-1, pub-2]; rng 0.99 swaps the last candidate into slot 0.
    const rows = await listRandomPublishedGameSummaries(
      db.client,
      2,
      sequenceRng([0.99, 0]),
    );
    expect(rows.map((r) => r.id)).toEqual(["pub-2", "pub-1"]);
  });

  it("returns the whole catalog when limit exceeds it", async () => {
    const rows = await listRandomPublishedGameSummaries(db.client, 10);
    expect(rows.map((r) => r.id).sort()).toEqual(["pub-1", "pub-2"]);
  });

  it("returns [] for an empty catalog", async () => {
    db.tables.games.length = 0;
    await expect(
      listRandomPublishedGameSummaries(db.client, 10),
    ).resolves.toEqual([]);
  });

  it("never exposes publisher ids or content in the summary shape", async () => {
    const rows = await listRandomPublishedGameSummaries(db.client, 10);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows as unknown as Row[]) {
      expect(row).not.toHaveProperty("account_id");
      expect(row).not.toHaveProperty("kid_id");
      expect(row).not.toHaveProperty("published_by_account_id");
      expect(row).not.toHaveProperty("agent_transcript_enc");
      expect(row).not.toHaveProperty("code_bundle");
    }
  });

  it("maps the byline for parent publications and system rows", async () => {
    db.tables.games.push(
      publishedRow({
        id: "sys-1",
        is_system: true,
        system_key: "drawing-basic",
        account_id: null,
        kid_id: null,
        published_by_account_id: null,
        publication_requested_at: null,
        approved_by: "system",
        published_at: "2026-07-11T10:00:00Z",
        author: null,
      }),
    );
    const rows = await listRandomPublishedGameSummaries(db.client, 10);
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get("pub-1")?.publication_handle).toBe("fun_games");
    expect(byId.get("sys-1")?.publication_handle).toBeNull();
    expect(byId.get("sys-1")?.is_system).toBe(true);
  });
});

describe("listPublishedSitemapEntries", () => {
  it("returns id + timestamps of LIVE games only, newest first", async () => {
    const entries = await listPublishedSitemapEntries(db.client);
    expect(entries.map((e) => e.id)).toEqual(["pub-2", "pub-1"]);
    expect(entries[0]).toEqual({
      id: "pub-2",
      published_at: "2026-07-10T10:00:00Z",
      updated_at: "2026-07-02T10:00:00Z",
    });
  });

  it("carries nothing beyond the three sitemap fields", async () => {
    const entries = await listPublishedSitemapEntries(db.client);
    for (const entry of entries as unknown as Row[]) {
      expect(Object.keys(entry).sort()).toEqual([
        "id",
        "published_at",
        "updated_at",
      ]);
    }
  });
});

describe("getPublishedGameDetail", () => {
  it("returns the full content for a LIVE game, without publisher ids", async () => {
    const detail = await getPublishedGameDetail(db.client, "pub-1");
    expect(detail?.code_bundle).toContain("<html>");
    expect(detail?.publication_handle).toBe("fun_games");
    expect(detail as unknown as Row).not.toHaveProperty("account_id");
    expect(detail as unknown as Row).not.toHaveProperty("published_by_account_id");
  });

  it("returns null for pending and private rows", async () => {
    await expect(getPublishedGameDetail(db.client, "pending-1")).resolves.toBeNull();
    await expect(getPublishedGameDetail(db.client, "private-1")).resolves.toBeNull();
  });
});

describe("getPublishedGame(s) — the playable Game shape", () => {
  it("nulls every owner field on the way out", async () => {
    const game = await getPublishedGame(db.client, "pub-1");
    expect(game).toMatchObject({
      id: "pub-1",
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
    await expect(getPublishedGame(db.client, "pending-1")).resolves.toBeNull();
    await expect(getPublishedGame(db.client, "private-1")).resolves.toBeNull();
  });

  it("getPublishedGamesByIds drops ids that are not published", async () => {
    const games = await getPublishedGamesByIds(db.client, [
      "pub-1",
      "pending-1",
      "missing",
    ]);
    expect(games.map((g) => g.id)).toEqual(["pub-1"]);
    expect(games[0].account_id).toBeNull();
  });

  it("getPublishedGamesByIds short-circuits on an empty id list", async () => {
    await expect(getPublishedGamesByIds(db.client, [])).resolves.toEqual([]);
  });
});

describe("getGameStats", () => {
  /** Minimal rpc-only stand-in — the real client's rpc surface. */
  function rpcClient(
    handler: (fn: string, args: unknown) => { data: unknown; error: unknown },
  ) {
    const calls: { fn: string; args: unknown }[] = [];
    const client = {
      rpc: (fn: string, args: unknown) => {
        calls.push({ fn, args });
        return Promise.resolve(handler(fn, args));
      },
    } as unknown as typeof db.client;
    return { client, calls };
  }

  it("maps rpc rows to a per-game plays/copies map", async () => {
    const { client, calls } = rpcClient(() => ({
      data: [
        { game_id: "pub-1", plays: 12, copies: 3 },
        { game_id: "pub-2", plays: 0, copies: 0 },
      ],
      error: null,
    }));
    const stats = await getGameStats(client, ["pub-1", "pub-2"]);
    expect(stats.get("pub-1")).toEqual({ plays: 12, copies: 3 });
    expect(stats.get("pub-2")).toEqual({ plays: 0, copies: 0 });
    expect(calls).toEqual([
      { fn: "discover_game_stats", args: { p_game_ids: ["pub-1", "pub-2"] } },
    ]);
  });

  it("coerces bigint-as-string counts to numbers", async () => {
    const { client } = rpcClient(() => ({
      data: [{ game_id: "pub-1", plays: "9", copies: "2" }],
      error: null,
    }));
    const stats = await getGameStats(client, ["pub-1"]);
    expect(stats.get("pub-1")).toEqual({ plays: 9, copies: 2 });
  });

  it("short-circuits (no rpc) on an empty id list", async () => {
    const { client, calls } = rpcClient(() => ({ data: [], error: null }));
    const stats = await getGameStats(client, []);
    expect(stats.size).toBe(0);
    expect(calls).toEqual([]);
  });

  it("propagates an rpc error", async () => {
    const { client } = rpcClient(() => ({
      data: null,
      error: { message: "boom" },
    }));
    await expect(getGameStats(client, ["pub-1"])).rejects.toBeTruthy();
  });
});
