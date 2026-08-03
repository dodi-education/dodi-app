import { beforeEach, describe, expect, it } from "vitest";

import type { Game } from "@dodi/types/database";

import { type Row, fakeDb } from "../test-support/fake-supabase";

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

const ACCOUNT = "acc-1";
const SOURCE_ID = "game-1";

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

function sourceGame(overrides: Row = {}): Row {
  return {
    id: SOURCE_ID,
    account_id: ACCOUNT,
    is_system: false,
    kid_id: "kid-1",
    tags: ["math"],
    target_age_min: 5,
    target_age_max: 8,
    estimated_duration_minutes: 10,
    progress_kind: "goal",
    metadata: {},
    created_by: "parent",
    agent_transcript_enc: "enc:v1:k1:aaa:bbb",
    publication_requested_at: null,
    ...overrides,
  };
}

let db: ReturnType<
  typeof fakeDb<{
    games: Row[];
    accounts: Row[];
    game_publication_requests: Row[];
    game_translations: Row[];
  }>
>;

beforeEach(() => {
  db = fakeDb({
    games: [sourceGame()],
    accounts: [
      {
        id: ACCOUNT,
        publication_handle: "fun_games",
        monthly_game_publication_limit: 3,
        flagged_for_review_at: null,
      },
    ],
    game_publication_requests: [],
    game_translations: [],
  });
});

describe("submitPublication", () => {
  it("forks a plaintext copy and leaves the private source untouched", async () => {
    const pub = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    })) as unknown as Row;

    expect(db.tables.games).toHaveLength(2);
    expect(pub.source_game_id).toBe(SOURCE_ID);
    expect(pub.title).toBe("Counting Comets");
    expect(pub.publication_requested_at).toBeTruthy();
    expect(pub.published_at).toBeNull();
    expect(pub.approved_by).toBeNull();
    expect(pub.published_by_account_id).toBe(ACCOUNT);

    // The source row is not modified in any way.
    const source = db.tables.games.find((g) => g.id === SOURCE_ID)!;
    expect(source.publication_requested_at).toBeNull();
    expect(source.title).toBeUndefined();
  });

  it("does not carry the studio conversation into the public copy", async () => {
    const pub = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    })) as unknown as Row;

    expect(pub.agent_transcript_enc).toBeUndefined();
    // Nor anything that ties the listing to a specific child.
    expect(pub.kid_id).toBeNull();
    expect(pub.is_active).toBe(false);
    expect(pub.current_game_version_id).toBeNull();
  });

  it("copies the plaintext facets from the source row", async () => {
    const pub = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    })) as unknown as Row;

    expect(pub.tags).toEqual(["math"]);
    expect(pub.target_age_min).toBe(5);
    expect(pub.progress_kind).toBe("goal");
  });

  it("stamps available_locales and writes a translation row per locale", async () => {
    const pub = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    })) as unknown as Row;

    expect(pub.available_locales).toEqual(["en", "de"]);
    const rows = db.tables.game_translations.filter((r) => r.game_id === pub.id);
    expect(rows.map((r) => r.locale).sort()).toEqual(["de", "en"]);
    expect(rows.find((r) => r.locale === "de")!.title).toBe("Kometen zählen");
  });

  it("replaces translation rows on re-submit instead of accumulating", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await submitPublication(db.client, {
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
    const rows = db.tables.game_translations;
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.locale === "en")!.title).toBe("Counting Comets 2");
  });

  it("rejects a bundle without a translations block", async () => {
    await expect(
      submitPublication(db.client, {
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
      submitPublication(db.client, {
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
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: { ...CONTENT, codeBundle: gappy },
      }),
    ).rejects.toMatchObject({ message: "publication_translations_incomplete" });
  });

  it("rejects a submission without listing translations", async () => {
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: { ...CONTENT, translations: undefined },
      }),
    ).rejects.toMatchObject({ message: "publication_translations_incomplete" });
  });

  it("replaces the existing copy on re-submit and sends it back to review", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await approvePublication(
      db.client,
      db.tables.games[1].id as string,
      "system",
    );
    expect(db.tables.games[1].published_at).toBeTruthy();

    const again = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: { ...CONTENT, title: "Counting Comets 2" },
    })) as unknown as Row;

    expect(db.tables.games).toHaveLength(2);
    expect(again.title).toBe("Counting Comets 2");
    expect(again.published_at).toBeNull();
    expect(again.approved_by).toBeNull();
  });

  it("refuses a game the caller does not own", async () => {
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: "someone-else",
        content: CONTENT,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses an account with no publication handle", async () => {
    db.tables.accounts[0].publication_handle = null;
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      }),
    ).rejects.toBeInstanceOf(PublicationError);
  });

  it("rejects a bundle the sanitizer refuses — this copy runs on other devices", async () => {
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: { ...CONTENT, codeBundle: "<script>fetch('//evil')</script>" },
      }),
    ).rejects.toThrow(/Unsafe game bundle/);
    expect(db.tables.games).toHaveLength(1);
  });
});

describe("submitPublication quota", () => {
  it("logs one request row per submit", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    expect(db.tables.game_publication_requests).toHaveLength(1);
    expect(db.tables.game_publication_requests[0]).toMatchObject({
      account_id: ACCOUNT,
      source_game_id: SOURCE_ID,
    });
  });

  it("converts the translate step's draft into the submit log row", async () => {
    await savePublicationDraft(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      listingTranslationsEnc: "enc:v1:k1:aaa:bbb",
    });
    expect(db.tables.game_publication_requests).toHaveLength(1);

    const pub = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    })) as unknown as Row;

    // Still ONE row: the draft was stamped, not duplicated; the sealed blob
    // is cleared (the plaintext game_translations rows supersede it).
    expect(db.tables.game_publication_requests).toHaveLength(1);
    expect(db.tables.game_publication_requests[0]).toMatchObject({
      source_game_id: SOURCE_ID,
      publication_game_id: pub.id,
      listing_translations_enc: null,
    });
    expect(db.tables.game_publication_requests[0].submitted_at).toBeTruthy();
  });

  it("refuses the submit that would exceed the monthly limit", async () => {
    const thisMonth = new Date().toISOString();
    db.tables.game_publication_requests.push(
      { id: "r1", account_id: ACCOUNT, submitted_at: thisMonth },
      { id: "r2", account_id: ACCOUNT, submitted_at: thisMonth },
      { id: "r3", account_id: ACCOUNT, submitted_at: thisMonth },
    );
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      }),
    ).rejects.toMatchObject({
      message: "publication_limit_reached",
      status: 403,
    });
    expect(db.tables.games).toHaveLength(1);
  });

  it("does not count previous months or other accounts", async () => {
    db.tables.game_publication_requests.push(
      { id: "r1", account_id: ACCOUNT, submitted_at: "2020-01-05T00:00:00Z" },
      { id: "r2", account_id: ACCOUNT, submitted_at: "2020-01-06T00:00:00Z" },
      { id: "r3", account_id: ACCOUNT, submitted_at: "2020-01-07T00:00:00Z" },
      {
        id: "r4",
        account_id: "someone-else",
        submitted_at: new Date().toISOString(),
      },
    );
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      }),
    ).resolves.toBeTruthy();
  });

  it("does not count drafts toward the quota", async () => {
    db.tables.game_publication_requests.push(
      { id: "r1", account_id: ACCOUNT, submitted_at: new Date().toISOString() },
      { id: "r2", account_id: ACCOUNT, submitted_at: new Date().toISOString() },
      {
        id: "draft",
        account_id: ACCOUNT,
        source_game_id: SOURCE_ID,
        submitted_at: null,
        listing_translations_enc: "enc:v1:k1:aaa:bbb",
      },
    );
    // Limit is 3: two submitted + one draft must still leave room.
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      }),
    ).resolves.toBeTruthy();
  });

  it("honors a per-account limit override", async () => {
    db.tables.accounts[0].monthly_game_publication_limit = 0;
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      }),
    ).rejects.toMatchObject({ message: "publication_limit_reached" });
  });
});

describe("hard-rejection block", () => {
  async function submitAndHardReject(): Promise<void> {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await rejectPublication(db.client, db.tables.games[1].id as string, {
      kind: "hard",
      reasons: [{ code: "hard_forbidden_content", note: "nope" }],
    });
  }

  it("refuses to resubmit a hard-rejected source game", async () => {
    await submitAndHardReject();
    await expect(
      submitPublication(db.client, {
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
    await withdrawPublication(db.client, SOURCE_ID, ACCOUNT);
    // The copy survives as moderation evidence…
    expect(db.tables.games).toHaveLength(2);
    expect(db.tables.games[1].rejection_kind).toBe("hard");
    // …and the block holds regardless (the log is the durable authority).
    await expect(
      submitPublication(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: ACCOUNT,
        content: CONTENT,
      }),
    ).rejects.toMatchObject({ message: "publication_hard_rejected" });
  });

  it("withdraw still deletes pending and soft-rejected copies", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await rejectPublication(db.client, db.tables.games[1].id as string, {
      kind: "soft",
      reasons: [{ code: "soft_quality_below_bar", note: "broken" }],
    });
    await withdrawPublication(db.client, SOURCE_ID, ACCOUNT);
    expect(db.tables.games).toHaveLength(1);
  });

  it("a soft rejection does not block resubmission", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await rejectPublication(db.client, db.tables.games[1].id as string, {
      kind: "soft",
      reasons: [{ code: "soft_quality_below_bar", note: "broken" }],
    });

    const again = (await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    })) as unknown as Row;
    // The resubmit re-enters review clean.
    expect(again.rejected_at).toBeNull();
    expect(again.rejection_kind).toBeNull();
    expect(again.rejection_reasons).toBeNull();
    expect(again.review_attempts).toBe(0);
  });
});

describe("rejectPublication", () => {
  async function submitted(): Promise<string> {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    return db.tables.games[1].id as string;
  }

  it("stamps the rejection on the copy and the open log row", async () => {
    const id = await submitted();
    const rejected = await rejectPublication(db.client, id, {
      kind: "soft",
      reasons: [{ code: "soft_contains_personal_information", note: "a name" }],
    });

    expect(rejected.rejected_at).toBeTruthy();
    expect(rejected.rejection_kind).toBe("soft");
    expect(db.tables.game_publication_requests[0]).toMatchObject({
      outcome: "rejected",
      rejection_kind: "soft",
    });
    expect(db.tables.game_publication_requests[0].decided_at).toBeTruthy();
  });

  it("soft rejection does NOT flag the account", async () => {
    const id = await submitted();
    await rejectPublication(db.client, id, {
      kind: "soft",
      reasons: [{ code: "soft_quality_below_bar", note: "" }],
    });
    expect(db.tables.accounts[0].flagged_for_review_at).toBeNull();
  });

  it("hard rejection flags the account exactly once", async () => {
    const id = await submitted();
    await rejectPublication(db.client, id, {
      kind: "hard",
      reasons: [{ code: "hard_child_safety", note: "" }],
    });
    const flaggedAt = db.tables.accounts[0].flagged_for_review_at;
    expect(flaggedAt).toBeTruthy();

    // A later hard rejection keeps the original timestamp.
    db.tables.games[1].rejected_at = null;
    db.tables.games[1].rejection_kind = null;
    db.tables.games[1].published_at = null;
    await rejectPublication(db.client, id, {
      kind: "hard",
      reasons: [{ code: "hard_forbidden_content", note: "" }],
    });
    expect(db.tables.accounts[0].flagged_for_review_at).toBe(flaggedAt);
  });

  it("404s when the copy was withdrawn mid-review", async () => {
    const id = await submitted();
    await withdrawPublication(db.client, SOURCE_ID, ACCOUNT);
    await expect(
      rejectPublication(db.client, id, {
        kind: "soft",
        reasons: [{ code: "soft_quality_below_bar", note: "" }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("404s for an already-published copy (reject can't unpublish)", async () => {
    const id = await submitted();
    await approvePublication(db.client, id, "system");
    await expect(
      rejectPublication(db.client, id, {
        kind: "soft",
        reasons: [{ code: "soft_quality_below_bar", note: "" }],
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("publication drafts", () => {
  it("upserts a single draft per source game and reads it back", async () => {
    await savePublicationDraft(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      listingTranslationsEnc: "enc:v1:k1:aaa:bbb",
    });
    await savePublicationDraft(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      listingTranslationsEnc: "enc:v1:k1:ccc:ddd",
    });

    expect(db.tables.game_publication_requests).toHaveLength(1);
    expect(db.tables.game_publication_requests[0].submitted_at ?? null).toBeNull();
    await expect(
      getPublicationDraft(db.client, SOURCE_ID, ACCOUNT),
    ).resolves.toBe("enc:v1:k1:ccc:ddd");
  });

  it("returns null when no draft exists (only submitted rows)", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await expect(
      getPublicationDraft(db.client, SOURCE_ID, ACCOUNT),
    ).resolves.toBeNull();
  });

  it("refuses a draft for a game the caller does not own", async () => {
    await expect(
      savePublicationDraft(db.client, {
        sourceGameId: SOURCE_ID,
        accountId: "someone-else",
        listingTranslationsEnc: "enc:v1:k1:aaa:bbb",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.tables.game_publication_requests).toHaveLength(0);
  });
});

describe("withdrawPublication", () => {
  it("deletes the copy and leaves the source alone", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await withdrawPublication(db.client, SOURCE_ID, ACCOUNT);

    expect(db.tables.games).toHaveLength(1);
    expect(db.tables.games[0].id).toBe(SOURCE_ID);
    await expect(
      getPublication(db.client, SOURCE_ID, ACCOUNT),
    ).resolves.toBeNull();
  });
});

describe("approvePublication", () => {
  it("stamps published_at and who approved it", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    const id = db.tables.games[1].id as string;

    const approved = await approvePublication(db.client, id, "admin");
    expect(approved.published_at).toBeTruthy();
    expect(approved.approved_by).toBe("admin");
    // The open request-log row is decided too.
    expect(db.tables.game_publication_requests[0]).toMatchObject({
      outcome: "approved",
    });
  });

  it("an admin approval supersedes a rejection", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    const id = db.tables.games[1].id as string;
    await rejectPublication(db.client, id, {
      kind: "soft",
      reasons: [{ code: "soft_quality_below_bar", note: "" }],
    });

    const approved = await approvePublication(db.client, id, "admin");
    expect(approved.published_at).toBeTruthy();
    expect(approved.rejected_at).toBeNull();
    expect(approved.rejection_kind).toBeNull();
  });

  it("404s for an id that was never submitted", async () => {
    await expect(
      approvePublication(db.client, SOURCE_ID, "system"),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("listPendingPublications", () => {
  it("returns only unapproved submissions", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    expect(await listPendingPublications(db.client)).toHaveLength(1);

    await approvePublication(
      db.client,
      db.tables.games[1].id as string,
      "system",
    );
    expect(await listPendingPublications(db.client)).toHaveLength(0);
  });

  it("never includes ordinary private games", async () => {
    const pending = (await listPendingPublications(db.client)) as unknown as Row[];
    expect(pending).toHaveLength(0);
  });

  it("excludes rejected submissions — they wait on the parent, not the queue", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    await rejectPublication(db.client, db.tables.games[1].id as string, {
      kind: "soft",
      reasons: [{ code: "soft_quality_below_bar", note: "" }],
    });
    expect(await listPendingPublications(db.client)).toHaveLength(0);
  });

  it("respects maxAttempts, leaving exhausted items to the operator view", async () => {
    await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    db.tables.games[1].review_attempts = 3;

    expect(await listPendingPublications(db.client, 50, 3)).toHaveLength(0);
    // The unfiltered default (the operator endpoint) still sees it.
    expect(await listPendingPublications(db.client)).toHaveLength(1);
  });
});

/** Typed re-export guard: the service returns Game rows, not bare records. */
describe("types", () => {
  it("returns a Game from submit", async () => {
    const pub: Game = await submitPublication(db.client, {
      sourceGameId: SOURCE_ID,
      accountId: ACCOUNT,
      content: CONTENT,
    });
    expect(pub.id).toBeTruthy();
  });
});
