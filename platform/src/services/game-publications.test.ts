import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Game } from "@dodi/types/database";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";

import {
  PublicationError,
  approvePublication,
  getPublication,
  getPublicationDraft,
  listPendingPublications,
  rejectPublication,
  savePublicationDraft,
  submitPublication,
  withdrawPublication,
} from "./game-publications";

const SOURCE_ID = "cccccccc-3333-4333-8333-333333333333";

// Bundle with a translations block covering every platform locale — the gate
// requires full coverage (see the dedicated gate tests below).
const TRANSLATED_BUNDLE =
  '<html><head><script type="application/dodi-translations">' +
  '{"sourceLocale":"en","locales":{"en":{"go":"Go!"},"de":{"go":"Los!"}}}' +
  "</script></head><body>hi</body></html>";

const CONTENT = {
  title: "Counting Comets",
  description: "Count the comets",
  codeBundle: TRANSLATED_BUNDLE,
  markdown: "# Briefing",
  learningGoal: "Count to ten",
  successDefinition: "3 sums",
  successCriteria: { description: "3 sums" },
  previewImage: null,
  translations: {
    en: { title: "Counting Comets", description: "Count the comets" },
    de: { title: "Kometen zählen", description: "Zähle die Kometen" },
  },
};

describe("game publications", () => {
  let t: TestDatabase;
  let ACCOUNT: string;
  let OTHER_ACCOUNT: string;
  let kidId: string;

  beforeAll(async () => {
    t = await createTestDb();
    ACCOUNT = await t.createAccount("publisher@example.com");
    OTHER_ACCOUNT = await t.createAccount("stranger@example.com");
    const kid = await t.serviceDb
      .insertInto("kids")
      .values({ account_id: ACCOUNT, display_name: "enc:kid", social_id: "sid-pub" })
      .returning("id")
      .executeTakeFirstOrThrow();
    kidId = kid.id;
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  beforeEach(async () => {
    await t.serviceDb.deleteFrom("game_publication_requests").execute();
    await t.serviceDb.deleteFrom("game_translations").execute();
    await t.serviceDb.deleteFrom("games").where("is_system", "=", false).execute();
    await t.serviceDb
      .updateTable("accounts")
      .set({
        publication_handle: "fun_games",
        monthly_game_publication_limit: 3,
        flagged_for_review_at: null,
      })
      .where("id", "=", ACCOUNT)
      .execute();

    // The private source game: E2EE, owned by a kid of this account.
    await t.serviceDb
      .insertInto("games")
      .values({
        id: SOURCE_ID,
        account_id: ACCOUNT,
        kid_id: kidId,
        title: "enc:v1:title",
        code_bundle: "enc:v1:bundle",
        tags: ["math"],
        target_age_min: 5,
        target_age_max: 8,
        estimated_duration_minutes: 10,
        progress_kind: "goal",
        created_by: "parent",
        agent_transcript_enc: "enc:v1:k1:aaa:bbb",
      })
      .execute();
  });

  /** The public fork of the source game, if one exists. */
  async function pub() {
    return t.serviceDb
      .selectFrom("games")
      .selectAll()
      .where("source_game_id", "=", SOURCE_ID)
      .executeTakeFirst();
  }

  async function pubId(): Promise<string> {
    const row = await pub();
    if (!row) throw new Error("no publication row");
    return row.id;
  }

  async function gameCount(): Promise<number> {
    const { count } = await t.serviceDb
      .selectFrom("games")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("is_system", "=", false)
      .executeTakeFirstOrThrow();
    return count;
  }

  async function requests() {
    return t.serviceDb
      .selectFrom("game_publication_requests")
      .selectAll()
      .orderBy("created_at", "asc")
      .execute();
  }

  async function translations() {
    return t.serviceDb.selectFrom("game_translations").selectAll().execute();
  }

  async function flaggedAt(): Promise<string | null> {
    const row = await t.serviceDb
      .selectFrom("accounts")
      .select("flagged_for_review_at")
      .where("id", "=", ACCOUNT)
      .executeTakeFirstOrThrow();
    return row.flagged_for_review_at;
  }

  /** Insert submitted request-log rows directly (quota fixtures). */
  async function logRows(
    rows: Array<{ accountId?: string; submittedAt: string | null; enc?: string }>,
  ): Promise<void> {
    await t.serviceDb
      .insertInto("game_publication_requests")
      .values(
        rows.map((r) => ({
          account_id: r.accountId ?? ACCOUNT,
          source_game_id: SOURCE_ID,
          submitted_at: r.submittedAt,
          listing_translations_enc: r.enc ?? null,
        })),
      )
      .execute();
  }

  describe("submitPublication", () => {
    it("forks a plaintext copy and leaves the private source untouched", async () => {
      const published = await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });

      expect(await gameCount()).toBe(2);
      expect(published.source_game_id).toBe(SOURCE_ID);
      expect(published.title).toBe("Counting Comets");
      expect(published.publication_requested_at).toBeTruthy();
      expect(published.published_at).toBeNull();
      expect(published.approved_by).toBeNull();
      expect(published.published_by_account_id).toBe(ACCOUNT);

      // The source row is not modified in any way.
      const source = await t.serviceDb
        .selectFrom("games")
        .select(["publication_requested_at", "title"])
        .where("id", "=", SOURCE_ID)
        .executeTakeFirstOrThrow();
      expect(source.publication_requested_at).toBeNull();
      expect(source.title).toBe("enc:v1:title");
    });

    it("does not carry the studio conversation into the public copy", async () => {
      const published = await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });

      const row = await pub();
      expect(row?.agent_transcript_enc).toBeNull();
      // Nor anything that ties the listing to a specific child.
      expect(published.kid_id).toBeNull();
      expect(published.is_active).toBe(false);
      expect(published.current_game_version_id).toBeNull();
    });

    it("copies the plaintext facets from the source row", async () => {
      const published = await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });

      expect(published.tags).toEqual(["math"]);
      expect(published.target_age_min).toBe(5);
      expect(published.progress_kind).toBe("goal");
    });

    it("stamps available_locales and writes a translation row per locale", async () => {
      const published = await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });

      expect(published.available_locales).toEqual(["en", "de"]);
      const rows = (await translations()).filter((r) => r.game_id === published.id);
      expect(rows.map((r) => r.locale).sort()).toEqual(["de", "en"]);
      expect(rows.find((r) => r.locale === "de")!.title).toBe("Kometen zählen");
    });

    it("replaces translation rows on re-submit instead of accumulating", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: {
          ...CONTENT,
          translations: {
            en: { title: "Counting Comets 2", description: "" },
            de: { title: "Kometen zählen 2", description: "" },
          },
        },
      });
      const rows = await translations();
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.locale === "en")!.title).toBe("Counting Comets 2");
    });

    it("rejects a bundle without a translations block", async () => {
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: { ...CONTENT, codeBundle: "<html><body>hi</body></html>" },
        }),
      ).rejects.toMatchObject({ message: "publication_translations_incomplete" });
    });

    it("rejects a block that does not cover every platform locale", async () => {
      const partial =
        '<html><head><script type="application/dodi-translations">' +
        '{"sourceLocale":"en","locales":{"en":{"go":"Go!"}}}' +
        "</script></head><body>hi</body></html>";
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: { ...CONTENT, codeBundle: partial },
        }),
      ).rejects.toMatchObject({ message: "publication_translations_incomplete" });
    });

    it("rejects a locale dict missing keys of the source locale", async () => {
      const gappy =
        '<html><head><script type="application/dodi-translations">' +
        '{"sourceLocale":"en","locales":{"en":{"go":"Go!","stop":"Stop!"},"de":{"go":"Los!"}}}' +
        "</script></head><body>hi</body></html>";
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: { ...CONTENT, codeBundle: gappy },
        }),
      ).rejects.toMatchObject({ message: "publication_translations_incomplete" });
    });

    it("rejects a submission without listing translations", async () => {
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: { ...CONTENT, translations: undefined },
        }),
      ).rejects.toMatchObject({ message: "publication_translations_incomplete" });
    });

    it("replaces the existing copy on re-submit and sends it back to review", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      await approvePublication(t.serviceDb, await pubId(), "system");
      expect((await pub())?.published_at).toBeTruthy();

      const again = await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: { ...CONTENT, title: "Counting Comets 2" },
      });

      expect(await gameCount()).toBe(2);
      expect(again.title).toBe("Counting Comets 2");
      expect(again.published_at).toBeNull();
      expect(again.approved_by).toBeNull();
    });

    it("refuses a game the caller does not own", async () => {
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: OTHER_ACCOUNT,
          content: CONTENT,
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("refuses an account with no publication handle", async () => {
      await t.serviceDb
        .updateTable("accounts")
        .set({ publication_handle: null })
        .where("id", "=", ACCOUNT)
        .execute();
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: CONTENT,
        }),
      ).rejects.toBeInstanceOf(PublicationError);
    });

    it("rejects a bundle the sanitizer refuses — this copy runs on other devices", async () => {
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: { ...CONTENT, codeBundle: "<script>fetch('//evil')</script>" },
        }),
      ).rejects.toThrow(/Unsafe game bundle/);
      expect(await gameCount()).toBe(1);
    });
  });

  describe("submitPublication quota", () => {
    it("logs one request row per submit", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      const rows = await requests();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        account_id: ACCOUNT,
        source_game_id: SOURCE_ID,
      });
    });

    it("converts the translate step's draft into the submit log row", async () => {
      await savePublicationDraft(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        listingTranslationsEnc: "enc:v1:k1:aaa:bbb",
      });
      expect(await requests()).toHaveLength(1);

      const published = await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });

      // Still ONE row: the draft was stamped, not duplicated; the sealed blob
      // is cleared (the plaintext game_translations rows supersede it).
      const rows = await requests();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        source_game_id: SOURCE_ID,
        publication_game_id: published.id,
        listing_translations_enc: null,
      });
      expect(rows[0].submitted_at).toBeTruthy();
    });

    it("refuses the submit that would exceed the monthly limit", async () => {
      const thisMonth = new Date().toISOString();
      await logRows([
        { submittedAt: thisMonth },
        { submittedAt: thisMonth },
        { submittedAt: thisMonth },
      ]);
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: CONTENT,
        }),
      ).rejects.toMatchObject({
        message: "publication_limit_reached",
        status: 403,
      });
      expect(await gameCount()).toBe(1);
    });

    it("does not count previous months or other accounts", async () => {
      await logRows([
        { submittedAt: "2020-01-05T00:00:00Z" },
        { submittedAt: "2020-01-06T00:00:00Z" },
        { submittedAt: "2020-01-07T00:00:00Z" },
        { accountId: OTHER_ACCOUNT, submittedAt: new Date().toISOString() },
      ]);
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: CONTENT,
        }),
      ).resolves.toBeTruthy();
    });

    it("does not count drafts toward the quota", async () => {
      await logRows([
        { submittedAt: new Date().toISOString() },
        { submittedAt: new Date().toISOString() },
      ]);
      // Limit is 3: two submitted + one draft must still leave room.
      await savePublicationDraft(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        listingTranslationsEnc: "enc:v1:k1:aaa:bbb",
      });
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: CONTENT,
        }),
      ).resolves.toBeTruthy();
    });

    it("honors a per-account limit override", async () => {
      await t.serviceDb
        .updateTable("accounts")
        .set({ monthly_game_publication_limit: 0 })
        .where("id", "=", ACCOUNT)
        .execute();
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: CONTENT,
        }),
      ).rejects.toMatchObject({ message: "publication_limit_reached" });
    });
  });

  describe("hard-rejection block", () => {
    async function submitAndHardReject(): Promise<void> {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      await rejectPublication(t.serviceDb, await pubId(), {
        kind: "hard",
        reasons: [{ code: "hard_forbidden_content", note: "nope" }],
      });
    }

    it("refuses to resubmit a hard-rejected source game", async () => {
      await submitAndHardReject();
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: CONTENT,
        }),
      ).rejects.toMatchObject({
        message: "publication_hard_rejected",
        status: 403,
      });
    });

    it("withdraw neither deletes a hard-rejected copy nor lifts the block", async () => {
      await submitAndHardReject();
      await withdrawPublication(t.serviceDb, SOURCE_ID, ACCOUNT);
      // The copy survives as moderation evidence…
      expect(await gameCount()).toBe(2);
      expect((await pub())?.rejection_kind).toBe("hard");
      // …and the block holds regardless (the log is the durable authority).
      await expect(
        submitPublication(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: ACCOUNT,
          content: CONTENT,
        }),
      ).rejects.toMatchObject({ message: "publication_hard_rejected" });
    });

    it("withdraw still deletes pending and soft-rejected copies", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      await rejectPublication(t.serviceDb, await pubId(), {
        kind: "soft",
        reasons: [{ code: "soft_quality_below_bar", note: "broken" }],
      });
      await withdrawPublication(t.serviceDb, SOURCE_ID, ACCOUNT);
      expect(await gameCount()).toBe(1);
    });

    it("a soft rejection does not block resubmission", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      await rejectPublication(t.serviceDb, await pubId(), {
        kind: "soft",
        reasons: [{ code: "soft_quality_below_bar", note: "broken" }],
      });

      const again = await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      // The resubmit re-enters review clean.
      expect(again.rejected_at).toBeNull();
      expect(again.rejection_kind).toBeNull();
      expect(again.rejection_reasons).toBeNull();
      expect(again.review_attempts).toBe(0);
    });
  });

  describe("rejectPublication", () => {
    async function submitted(): Promise<string> {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      return pubId();
    }

    it("stamps the rejection on the copy and the open log row", async () => {
      const id = await submitted();
      const rejected = await rejectPublication(t.serviceDb, id, {
        kind: "soft",
        reasons: [{ code: "soft_contains_personal_information", note: "a name" }],
      });

      expect(rejected.rejected_at).toBeTruthy();
      expect(rejected.rejection_kind).toBe("soft");
      const rows = await requests();
      expect(rows[0]).toMatchObject({
        outcome: "rejected",
        rejection_kind: "soft",
      });
      expect(rows[0].decided_at).toBeTruthy();
    });

    it("soft rejection does NOT flag the account", async () => {
      const id = await submitted();
      await rejectPublication(t.serviceDb, id, {
        kind: "soft",
        reasons: [{ code: "soft_quality_below_bar", note: "" }],
      });
      expect(await flaggedAt()).toBeNull();
    });

    it("hard rejection flags the account exactly once", async () => {
      const id = await submitted();
      await rejectPublication(t.serviceDb, id, {
        kind: "hard",
        reasons: [{ code: "hard_child_safety", note: "" }],
      });
      const first = await flaggedAt();
      expect(first).toBeTruthy();

      // A later hard rejection keeps the original timestamp.
      await t.serviceDb
        .updateTable("games")
        .set({ rejected_at: null, rejection_kind: null, published_at: null })
        .where("id", "=", id)
        .execute();
      await rejectPublication(t.serviceDb, id, {
        kind: "hard",
        reasons: [{ code: "hard_forbidden_content", note: "" }],
      });
      expect(await flaggedAt()).toBe(first);
    });

    it("404s when the copy was withdrawn mid-review", async () => {
      const id = await submitted();
      await withdrawPublication(t.serviceDb, SOURCE_ID, ACCOUNT);
      await expect(
        rejectPublication(t.serviceDb, id, {
          kind: "soft",
          reasons: [{ code: "soft_quality_below_bar", note: "" }],
        }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("404s for an already-published copy (reject can't unpublish)", async () => {
      const id = await submitted();
      await approvePublication(t.serviceDb, id, "system");
      await expect(
        rejectPublication(t.serviceDb, id, {
          kind: "soft",
          reasons: [{ code: "soft_quality_below_bar", note: "" }],
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("publication drafts", () => {
    it("upserts a single draft per source game and reads it back", async () => {
      await savePublicationDraft(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        listingTranslationsEnc: "enc:v1:k1:aaa:bbb",
      });
      await savePublicationDraft(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        listingTranslationsEnc: "enc:v1:k1:ccc:ddd",
      });

      const rows = await requests();
      expect(rows).toHaveLength(1);
      expect(rows[0].submitted_at).toBeNull();
      await expect(
        getPublicationDraft(t.serviceDb, SOURCE_ID, ACCOUNT),
      ).resolves.toBe("enc:v1:k1:ccc:ddd");
    });

    it("returns null when no draft exists (only submitted rows)", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      await expect(
        getPublicationDraft(t.serviceDb, SOURCE_ID, ACCOUNT),
      ).resolves.toBeNull();
    });

    it("refuses a draft for a game the caller does not own", async () => {
      await expect(
        savePublicationDraft(t.serviceDb, {
          sourceGameId: SOURCE_ID,
          accountId: OTHER_ACCOUNT,
          listingTranslationsEnc: "enc:v1:k1:aaa:bbb",
        }),
      ).rejects.toMatchObject({ status: 404 });
      expect(await requests()).toHaveLength(0);
    });
  });

  describe("withdrawPublication", () => {
    it("deletes the copy and leaves the source alone", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      await withdrawPublication(t.serviceDb, SOURCE_ID, ACCOUNT);

      expect(await gameCount()).toBe(1);
      const remaining = await t.serviceDb
        .selectFrom("games")
        .select("id")
        .where("is_system", "=", false)
        .executeTakeFirstOrThrow();
      expect(remaining.id).toBe(SOURCE_ID);
      await expect(
        getPublication(t.serviceDb, SOURCE_ID, ACCOUNT),
      ).resolves.toBeNull();
    });
  });

  describe("approvePublication", () => {
    it("stamps published_at and who approved it", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      const id = await pubId();

      const approved = await approvePublication(t.serviceDb, id, "admin");
      expect(approved.published_at).toBeTruthy();
      expect(approved.approved_by).toBe("admin");
      // The open request-log row is decided too.
      expect((await requests())[0]).toMatchObject({ outcome: "approved" });
    });

    it("an admin approval supersedes a rejection", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      const id = await pubId();
      await rejectPublication(t.serviceDb, id, {
        kind: "soft",
        reasons: [{ code: "soft_quality_below_bar", note: "" }],
      });

      const approved = await approvePublication(t.serviceDb, id, "admin");
      expect(approved.published_at).toBeTruthy();
      expect(approved.rejected_at).toBeNull();
      expect(approved.rejection_kind).toBeNull();
    });

    it("404s for an id that was never submitted", async () => {
      await expect(
        approvePublication(t.serviceDb, SOURCE_ID, "system"),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe("listPendingPublications", () => {
    it("returns only unapproved submissions", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      expect(await listPendingPublications(t.serviceDb)).toHaveLength(1);

      await approvePublication(t.serviceDb, await pubId(), "system");
      expect(await listPendingPublications(t.serviceDb)).toHaveLength(0);
    });

    it("never includes ordinary private games", async () => {
      expect(await listPendingPublications(t.serviceDb)).toHaveLength(0);
    });

    it("excludes rejected submissions — they wait on the parent, not the queue", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      await rejectPublication(t.serviceDb, await pubId(), {
        kind: "soft",
        reasons: [{ code: "soft_quality_below_bar", note: "" }],
      });
      expect(await listPendingPublications(t.serviceDb)).toHaveLength(0);
    });

    it("respects maxAttempts, leaving exhausted items to the operator view", async () => {
      await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      await t.serviceDb
        .updateTable("games")
        .set({ review_attempts: 3 })
        .where("id", "=", await pubId())
        .execute();

      expect(await listPendingPublications(t.serviceDb, 50, 3)).toHaveLength(0);
      // The unfiltered default (the operator endpoint) still sees it.
      expect(await listPendingPublications(t.serviceDb)).toHaveLength(1);
    });
  });

  /** Typed re-export guard: the service returns Game rows, not bare records. */
  describe("types", () => {
    it("returns a Game from submit", async () => {
      const published: Game = await submitPublication(t.serviceDb, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      });
      expect(published.id).toBeTruthy();
    });
  });
});
