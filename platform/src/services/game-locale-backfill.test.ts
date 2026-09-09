import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ThinkingProvider } from "@dodi/ai/thinking-providers/factory";
import { codeWithoutTranslationsBlock, extractTranslations } from "@dodi/games/translations";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";

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

const PUB_ID = "11111111-1111-4111-8111-111111111111";

interface GameSeed {
  id?: string;
  title?: string;
  description?: string;
  code_bundle?: string;
  published_at?: string | null;
  available_locales?: string[] | null;
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

describe("game locale backfill", () => {
  let t: TestDatabase;
  let accountId: string;

  beforeAll(async () => {
    t = await createTestDb();
    accountId = await t.createAccount("publisher@example.com");
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  /** Reset to a single published game plus its source-locale listing row. */
  async function seed(
    games: GameSeed[] = [{}],
    translations: Array<{ game_id?: string; locale: string; title: string }> = [
      { locale: "de", title: "Kometen zählen" },
    ],
  ): Promise<void> {
    await t.serviceDb.deleteFrom("game_translations").execute();
    await t.serviceDb.deleteFrom("games").where("is_system", "=", false).execute();
    // The baseline ships two system games with no available_locales, so they
    // would join every backfill batch. Mark them complete: these cases are
    // about the custom rows seeded below.
    await t.serviceDb
      .updateTable("games")
      .set({ available_locales: ["en", "de"] })
      .where("is_system", "=", true)
      .execute();
    await t.serviceDb
      .insertInto("games")
      .values(
        games.map((g) => ({
          id: g.id ?? PUB_ID,
          account_id: accountId,
          title: g.title ?? "Kometen zählen",
          description: g.description ?? "Zähle die Kometen",
          code_bundle: g.code_bundle ?? SOURCE_ONLY_BUNDLE,
          published_at:
            g.published_at === undefined ? "2026-07-22T10:00:00Z" : g.published_at,
          // A published non-system row must carry a review stamp
          // (games_published_requires_review_check).
          approved_by: g.published_at === null ? null : ("admin" as const),
          publication_requested_at:
            g.published_at === null ? null : "2026-07-21T10:00:00Z",
          available_locales:
            g.available_locales === undefined ? ["de"] : g.available_locales,
        })),
      )
      .execute();
    if (translations.length > 0) {
      await t.serviceDb
        .insertInto("game_translations")
        .values(
          translations.map((tr) => ({
            game_id: tr.game_id ?? PUB_ID,
            locale: tr.locale,
            title: tr.title,
            description: "",
          })),
        )
        .execute();
    }
  }

  async function game(id = PUB_ID) {
    return t.serviceDb
      .selectFrom("games")
      .select(["code_bundle", "available_locales"])
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
  }

  describe("listPublishedGamesNeedingLocales", () => {
    it("returns rows missing a platform locale or with NULL, excluding private ones", async () => {
      const done = "22222222-2222-4222-8222-222222222222";
      const legacy = "33333333-3333-4333-8333-333333333333";
      const partial = "44444444-4444-4444-8444-444444444444";
      const priv = "55555555-5555-4555-8555-555555555555";
      await seed(
        [
          { id: done, available_locales: ["en", "de"] },
          { id: legacy, available_locales: null },
          { id: partial, available_locales: ["de"] },
          { id: priv, published_at: null, available_locales: null },
        ],
        [],
      );
      const rows = await listPublishedGamesNeedingLocales(t.serviceDb, 10);
      expect(rows.map((r) => r.id).sort()).toEqual([legacy, partial].sort());
    });
  });

  describe("backfillGameLocales", () => {
    it("is disabled without the agent config", async () => {
      await seed();
      delete process.env.SECURITY_AGENT_KEY;
      const result = await backfillGameLocales(t.serviceDb, {
        providerFactory: stubFactory(GOOD_VERDICT),
      });
      expect(result.disabled).toBe(true);
      expect(result.processed).toBe(0);
    });

    it("adds the missing locale to block, listing, and available_locales", async () => {
      await seed();
      const result = await backfillGameLocales(t.serviceDb, {
        providerFactory: stubFactory(GOOD_VERDICT),
      });

      expect(result).toMatchObject({ processed: 1, updated: 1, errors: 0 });
      const row = await game();
      expect([...(row.available_locales ?? [])].sort()).toEqual(["de", "en"]);
      const block = extractTranslations(row.code_bundle).translations!;
      expect(block.locales.en).toEqual({ go: "Go!" });
      expect(block.locales.de).toEqual({ go: "Los!" });
      // Executable code is untouched: only the inert block changed.
      expect(codeWithoutTranslationsBlock(row.code_bundle)).toBe(
        codeWithoutTranslationsBlock(SOURCE_ONLY_BUNDLE),
      );
      const listing = await t.serviceDb
        .selectFrom("game_translations")
        .select(["game_id", "title"])
        .where("locale", "=", "en")
        .executeTakeFirst();
      expect(listing).toMatchObject({ game_id: PUB_ID, title: "Counting Comets" });
    });

    it("dry run computes details but writes nothing", async () => {
      await seed();
      const result = await backfillGameLocales(t.serviceDb, {
        dryRun: true,
        providerFactory: stubFactory(GOOD_VERDICT),
      });

      expect(result.dryRun).toBe(true);
      expect(result.updated).toBe(1);
      expect(result.details).toHaveLength(1);
      expect(result.details[0]).toMatchObject({ id: PUB_ID, missingLocales: ["en"] });
      expect(result.details[0].wouldGrowBytes).toBeGreaterThan(0);
      const row = await game();
      expect(row.code_bundle).toBe(SOURCE_ONLY_BUNDLE);
      expect(row.available_locales).toEqual(["de"]);
      const listings = await t.serviceDb
        .selectFrom("game_translations")
        .select("id")
        .where("game_id", "=", PUB_ID)
        .execute();
      expect(listings).toHaveLength(1);
    });

    it("counts a blockless published row as skippedNoBlock (system/legacy)", async () => {
      await seed([{ code_bundle: "<html><body>hi</body></html>", available_locales: null }]);
      const result = await backfillGameLocales(t.serviceDb, {
        providerFactory: stubFactory(GOOD_VERDICT),
      });
      expect(result).toMatchObject({ processed: 1, skippedNoBlock: 1, updated: 0 });
    });

    it("only refreshes available_locales when block and listing are already complete", async () => {
      const full =
        '<html><head><script type="application/dodi-translations">' +
        '{"sourceLocale":"de","locales":{"de":{"go":"Los!"},"en":{"go":"Go!"}}}' +
        "</script></head><body><script>init()</script></body></html>";
      await seed([{ code_bundle: full, available_locales: null }], [
        { locale: "de", title: "t" },
        { locale: "en", title: "t" },
      ]);
      const factory = stubFactory(GOOD_VERDICT);
      const result = await backfillGameLocales(t.serviceDb, { providerFactory: factory });

      expect(result).toMatchObject({ processed: 1, updated: 1 });
      expect(factory).not.toHaveBeenCalled();
      const row = await game();
      expect([...(row.available_locales ?? [])].sort()).toEqual(["de", "en"]);
      expect(row.code_bundle).toBe(full);
    });

    it("burns the item as an error on an agent failure, leaving the row untouched", async () => {
      await seed();
      const result = await backfillGameLocales(t.serviceDb, {
        providerFactory: stubFactory(async () => {
          throw new Error("provider down");
        }),
      });
      expect(result).toMatchObject({ processed: 1, errors: 1, updated: 0 });
      const row = await game();
      expect(row.code_bundle).toBe(SOURCE_ONLY_BUNDLE);
      expect(row.available_locales).toEqual(["de"]);
    });

    it("rejects an invalid agent result (missing key) as an error", async () => {
      await seed();
      const result = await backfillGameLocales(t.serviceDb, {
        providerFactory: stubFactory(async () => ({
          locales: { en: { title: "T", description: "", strings: {} } },
        })),
      });
      expect(result).toMatchObject({ processed: 1, errors: 1, updated: 0 });
    });

    it("skips a game whose merged bundle would overflow the size cap", async () => {
      const filler = "x".repeat(512 * 1024 - SOURCE_ONLY_BUNDLE.length - 50);
      const nearCap = SOURCE_ONLY_BUNDLE.replace("<body>", `<body><!--${filler}-->`);
      await seed([{ code_bundle: nearCap }]);
      const result = await backfillGameLocales(t.serviceDb, {
        providerFactory: stubFactory(GOOD_VERDICT),
      });
      expect(result).toMatchObject({ processed: 1, skippedTooLarge: 1, updated: 0 });
      expect((await game()).code_bundle).toBe(nearCap);
    });
  });
});
