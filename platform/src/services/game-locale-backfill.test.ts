import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ThinkingProvider } from "@dodi/ai/thinking-providers/factory";
import { codeWithoutTranslationsBlock, extractTranslations } from "@dodi/games/translations";

import { type Row, fakeDb } from "../test-support/fake-supabase";

vi.mock("@/lib/error-logs", () => ({ logServerError: vi.fn() }));

import {
  backfillGameLocales,
  listPublishedGamesNeedingLocales,
} from "./game-locale-backfill";

const AGENT_ENV = {
  SECURITY_AGENT_PROVIDER: "anthropic",
  SECURITY_AGENT_MODEL: "claude-sonnet-4-6",
  SECURITY_AGENT_KEY: "sk-ant-test",
} as const;

beforeEach(() => {
  for (const [key, value] of Object.entries(AGENT_ENV)) process.env[key] = value;
});
afterEach(() => {
  for (const key of Object.keys(AGENT_ENV)) delete process.env[key];
});

/** A published row whose block only carries its German source locale. */
const SOURCE_ONLY_BUNDLE =
  '<html><head><script type="application/dodi-translations">' +
  '{"sourceLocale":"de","locales":{"de":{"go":"Los!"}}}' +
  "</script></head><body><script>init()</script></body></html>";

function publishedGame(overrides: Row = {}): Row {
  return {
    id: "pub-1",
    title: "Kometen zählen",
    description: "Zähle die Kometen",
    code_bundle: SOURCE_ONLY_BUNDLE,
    published_at: "2026-07-22T10:00:00Z",
    available_locales: ["de"],
    ...overrides,
  };
}

function stubFactory(generateJson: () => Promise<Record<string, unknown>>) {
  const provider: ThinkingProvider = { generateJson, generateText: async () => "" };
  return vi.fn(
    () => provider,
  ) as unknown as typeof import("@dodi/ai/thinking-providers/factory").createThinkingProvider;
}

const GOOD_VERDICT = async () => ({
  locales: {
    en: {
      title: "Counting Comets",
      description: "Count the comets",
      strings: { go: "Go!" },
    },
  },
});

function makeDb(tables: { games?: Row[]; game_translations?: Row[] } = {}) {
  return fakeDb({
    games: tables.games ?? [publishedGame()],
    game_translations: tables.game_translations ?? [
      { id: "tr-1", game_id: "pub-1", locale: "de", title: "Kometen zählen", description: "" },
    ],
  });
}

describe("listPublishedGamesNeedingLocales", () => {
  it("returns rows missing a platform locale or with NULL, oldest first", async () => {
    const db = makeDb({
      games: [
        publishedGame({ id: "done", available_locales: ["en", "de"] }),
        publishedGame({ id: "null-legacy", available_locales: null }),
        publishedGame({ id: "partial", available_locales: ["de"] }),
        { id: "private", title: "x", code_bundle: "", published_at: null },
      ],
    });
    const rows = await listPublishedGamesNeedingLocales(db.client, 10);
    expect(rows.map((r) => r.id).sort()).toEqual(["null-legacy", "partial"]);
  });
});

describe("backfillGameLocales", () => {
  it("is disabled without the agent config", async () => {
    delete process.env.SECURITY_AGENT_KEY;
    const result = await backfillGameLocales(makeDb().client, {
      providerFactory: stubFactory(GOOD_VERDICT),
    });
    expect(result.disabled).toBe(true);
    expect(result.processed).toBe(0);
  });

  it("adds the missing locale to block, listing, and available_locales", async () => {
    const db = makeDb();
    const result = await backfillGameLocales(db.client, {
      providerFactory: stubFactory(GOOD_VERDICT),
    });

    expect(result).toMatchObject({ processed: 1, updated: 1, errors: 0 });
    const game = db.tables.games[0];
    expect(game.available_locales).toEqual(["en", "de"]);
    const block = extractTranslations(game.code_bundle as string).translations!;
    expect(block.locales.en).toEqual({ go: "Go!" });
    expect(block.locales.de).toEqual({ go: "Los!" });
    // Executable code is untouched — only the inert block changed.
    expect(codeWithoutTranslationsBlock(game.code_bundle as string)).toBe(
      codeWithoutTranslationsBlock(SOURCE_ONLY_BUNDLE),
    );
    const listing = db.tables.game_translations.find((r) => r.locale === "en");
    expect(listing).toMatchObject({ game_id: "pub-1", title: "Counting Comets" });
  });

  it("dry run computes details but writes nothing", async () => {
    const db = makeDb();
    const result = await backfillGameLocales(db.client, {
      dryRun: true,
      providerFactory: stubFactory(GOOD_VERDICT),
    });

    expect(result.dryRun).toBe(true);
    expect(result.updated).toBe(1);
    expect(result.details).toHaveLength(1);
    expect(result.details[0]).toMatchObject({ id: "pub-1", missingLocales: ["en"] });
    expect(result.details[0].wouldGrowBytes).toBeGreaterThan(0);
    expect(db.tables.games[0].code_bundle).toBe(SOURCE_ONLY_BUNDLE);
    expect(db.tables.games[0].available_locales).toEqual(["de"]);
    expect(db.tables.game_translations).toHaveLength(1);
  });

  it("counts a blockless published row as skippedNoBlock (system/legacy)", async () => {
    const db = makeDb({
      games: [publishedGame({ code_bundle: "<html><body>hi</body></html>", available_locales: null })],
    });
    const result = await backfillGameLocales(db.client, {
      providerFactory: stubFactory(GOOD_VERDICT),
    });
    expect(result).toMatchObject({ processed: 1, skippedNoBlock: 1, updated: 0 });
  });

  it("only refreshes available_locales when block and listing are already complete", async () => {
    const full =
      '<html><head><script type="application/dodi-translations">' +
      '{"sourceLocale":"de","locales":{"de":{"go":"Los!"},"en":{"go":"Go!"}}}' +
      "</script></head><body><script>init()</script></body></html>";
    const db = makeDb({
      games: [publishedGame({ code_bundle: full, available_locales: null })],
      game_translations: [
        { id: "tr-1", game_id: "pub-1", locale: "de", title: "t", description: "" },
        { id: "tr-2", game_id: "pub-1", locale: "en", title: "t", description: "" },
      ],
    });
    const factory = stubFactory(GOOD_VERDICT);
    const result = await backfillGameLocales(db.client, { providerFactory: factory });

    expect(result).toMatchObject({ processed: 1, updated: 1 });
    expect(factory).not.toHaveBeenCalled();
    expect(db.tables.games[0].available_locales).toEqual(["en", "de"]);
    expect(db.tables.games[0].code_bundle).toBe(full);
  });

  it("burns the item as an error on an agent failure, leaving the row untouched", async () => {
    const db = makeDb();
    const result = await backfillGameLocales(db.client, {
      providerFactory: stubFactory(async () => {
        throw new Error("provider down");
      }),
    });
    expect(result).toMatchObject({ processed: 1, errors: 1, updated: 0 });
    expect(db.tables.games[0].code_bundle).toBe(SOURCE_ONLY_BUNDLE);
    expect(db.tables.games[0].available_locales).toEqual(["de"]);
  });

  it("rejects an invalid agent result (missing key) as an error", async () => {
    const db = makeDb();
    const result = await backfillGameLocales(db.client, {
      providerFactory: stubFactory(async () => ({
        locales: { en: { title: "T", description: "", strings: {} } },
      })),
    });
    expect(result).toMatchObject({ processed: 1, errors: 1, updated: 0 });
  });

  it("skips a game whose merged bundle would overflow the size cap", async () => {
    const filler = "x".repeat(512 * 1024 - SOURCE_ONLY_BUNDLE.length - 50);
    const nearCap = SOURCE_ONLY_BUNDLE.replace("<body>", `<body><!--${filler}-->`);
    const db = makeDb({ games: [publishedGame({ code_bundle: nearCap })] });
    const result = await backfillGameLocales(db.client, {
      providerFactory: stubFactory(GOOD_VERDICT),
    });
    expect(result).toMatchObject({ processed: 1, skippedTooLarge: 1, updated: 0 });
    expect(db.tables.games[0].code_bundle).toBe(nearCap);
  });
});
