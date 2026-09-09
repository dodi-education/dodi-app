import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { ThinkingProvider } from "@dodi/ai/thinking-providers/factory";

import { createTestDb, type TestDatabase } from "../test-support/pglite-db";

// Assert on decisions, not real sends / real telemetry.
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/error-logs", () => ({ logServerError: vi.fn() }));

import {
  MAX_REVIEW_ATTEMPTS,
  buildReviewPrompt,
  loadReviewAgentConfig,
  processPendingPublications,
} from "./publication-review";
import type { Game, GameTranslation } from "@dodi/types/database";

const PUB_ID = "aaaaaaaa-1111-4111-8111-111111111111";
const SOURCE_ID = "bbbbbbbb-2222-4222-8222-222222222222";

/** Plain object for the prompt builder, which never touches the database. */
function publicationFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: PUB_ID,
    source_game_id: SOURCE_ID,
    is_system: false,
    is_active: false,
    kid_id: null,
    title: "Counting Comets",
    description: "Count the comets",
    code_bundle: "<html><body>hi</body></html>",
    markdown: "# Briefing",
    learning_goal: "Count to ten",
    success_definition: "3 sums",
    success_criteria: { description: "3 sums" },
    tags: ["math"],
    target_age_min: 5,
    target_age_max: 8,
    estimated_duration_minutes: 10,
    progress_kind: "goal",
    metadata: {},
    created_by: "parent",
    publication_requested_at: "2026-07-22T10:00:00Z",
    published_at: null,
    approved_by: null,
    rejected_at: null,
    rejection_kind: null,
    rejection_reasons: null,
    review_attempts: 0,
    ...overrides,
  };
}

/** The security agent reads its config from the environment, not the DB. */
const AGENT_ENV = {
  SECURITY_AGENT_PROVIDER: "anthropic",
  SECURITY_AGENT_MODEL: "claude-sonnet-4-6",
  SECURITY_AGENT_KEY: "sk-ant-test",
} as const;

function setAgentEnv(
  overrides: Partial<Record<keyof typeof AGENT_ENV, string>> = {},
) {
  for (const [key, value] of Object.entries({ ...AGENT_ENV, ...overrides })) {
    process.env[key] = value;
  }
}

function clearAgentEnv() {
  for (const key of Object.keys(AGENT_ENV)) delete process.env[key];
}

/** A provider factory whose generateJson returns (or throws) per call. */
function stubFactory(generateJson: () => Promise<Record<string, unknown>>) {
  const provider: ThinkingProvider = {
    generateJson,
    generateText: async () => "",
  };
  const factory = vi.fn(() => provider);
  return factory as unknown as typeof import("@dodi/ai/thinking-providers/factory").createThinkingProvider &
    ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  sendEmailMock.mockReset();
  process.env.SYSTEM_NOTIFICATION_EMAIL = "ops@example.com";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.dodi.app";
  setAgentEnv(); // a valid, enabled config by default
});

afterEach(() => {
  clearAgentEnv();
});

describe("buildReviewPrompt", () => {
  it("renders every listing translation and the multilingual instruction", () => {
    const { system, user } = buildReviewPrompt(
      publicationFixture() as unknown as Game,
      [
        {
          id: "tr-1",
          game_id: PUB_ID,
          locale: "de",
          title: "Kometen zählen",
          description: "Zähle die Kometen",
        },
      ] as unknown as GameTranslation[],
    );
    expect(system).toContain("application/dodi-translations");
    expect(system).toContain("soft_translation_quality");
    expect(user).toContain("## Listing translations");
    expect(user).toContain("de: Kometen zählen");
  });

  it("omits the listing section when no rows exist (legacy/system)", () => {
    const { user } = buildReviewPrompt(publicationFixture() as unknown as Game);
    expect(user).not.toContain("## Listing translations");
  });
});

describe("loadReviewAgentConfig", () => {
  it("returns the config when all three vars are valid", () => {
    setAgentEnv();
    expect(loadReviewAgentConfig()).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
    });
  });

  it("trims surrounding whitespace on each var", () => {
    setAgentEnv({
      SECURITY_AGENT_PROVIDER: " anthropic ",
      SECURITY_AGENT_KEY: "sk-ant-test\n",
    });
    expect(loadReviewAgentConfig()).toEqual({
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      apiKey: "sk-ant-test",
    });
  });

  it("returns null (disabled) when the vars are unset", () => {
    clearAgentEnv();
    expect(loadReviewAgentConfig()).toBeNull();
  });

  it("returns null (disabled) when all three vars are blank", () => {
    setAgentEnv({
      SECURITY_AGENT_PROVIDER: "",
      SECURITY_AGENT_MODEL: "",
      SECURITY_AGENT_KEY: "",
    });
    expect(loadReviewAgentConfig()).toBeNull();
  });

  it("a partially set config is misconfigured, not disabled — but still null", () => {
    setAgentEnv({ SECURITY_AGENT_KEY: "" });
    expect(loadReviewAgentConfig()).toBeNull();
  });

  it("returns null for an unknown provider", () => {
    setAgentEnv({ SECURITY_AGENT_PROVIDER: "openai" });
    expect(loadReviewAgentConfig()).toBeNull();
  });

  it("returns null for a model without the thinking capability", () => {
    setAgentEnv({
      SECURITY_AGENT_PROVIDER: "gemini",
      SECURITY_AGENT_MODEL: "gemini-3.1-flash-image",
    });
    expect(loadReviewAgentConfig()).toBeNull();
  });

  it("returns null when a var is missing", () => {
    setAgentEnv();
    delete process.env.SECURITY_AGENT_KEY;
    expect(loadReviewAgentConfig()).toBeNull();
  });
});

describe("processPendingPublications", () => {
  let t: TestDatabase;
  let accountId: string;

  beforeAll(async () => {
    t = await createTestDb();
    accountId = await t.createAccount("parent@example.com");
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  /** One pending publication row (a fork of a private source game). */
  async function seed(
    overrides: Record<string, unknown> = {},
    options: { notificationPreferences?: Record<string, boolean> } = {},
  ): Promise<void> {
    await t.serviceDb.deleteFrom("game_translations").execute();
    await t.serviceDb.deleteFrom("game_publication_requests").execute();
    await t.serviceDb.deleteFrom("games").where("is_system", "=", false).execute();
    await t.serviceDb
      .updateTable("accounts")
      .set({
        publication_handle: "fun_games",
        flagged_for_review_at: null,
        language: "en",
        notification_preferences:
          options.notificationPreferences ?? { friend_approval_email: true },
      } as never)
      .where("id", "=", accountId)
      .execute();

    // The private source game the publication forked from.
    await t.serviceDb
      .insertInto("games")
      .values({
        id: SOURCE_ID,
        account_id: accountId,
        title: "enc:source",
        code_bundle: "enc:bundle",
      })
      .execute();

    await t.serviceDb
      .insertInto("games")
      .values({
        ...publicationFixture(overrides),
        account_id: accountId,
        published_by_account_id: accountId,
      } as never)
      .execute();

    await t.serviceDb
      .insertInto("game_translations")
      .values({
        game_id: PUB_ID,
        locale: "de",
        title: "Kometen zählen",
        description: "",
      })
      .execute();

    await t.serviceDb
      .insertInto("game_publication_requests")
      .values({
        account_id: accountId,
        source_game_id: SOURCE_ID,
        publication_game_id: PUB_ID,
        submitted_at: "2026-07-22T10:00:00Z",
      })
      .execute();
  }

  async function publication() {
    return t.serviceDb
      .selectFrom("games")
      .select([
        "published_at",
        "approved_by",
        "rejected_at",
        "rejection_kind",
        "rejection_reasons",
        "review_attempts",
      ])
      .where("id", "=", PUB_ID)
      .executeTakeFirstOrThrow();
  }

  async function account() {
    return t.serviceDb
      .selectFrom("accounts")
      .select("flagged_for_review_at")
      .where("id", "=", accountId)
      .executeTakeFirstOrThrow();
  }

  /** The publisher-addressed send among a run's emails (operator + publisher). */
  function publisherSend() {
    return sendEmailMock.mock.calls
      .map((c) => c[0])
      .find((e) => e.to === "parent@example.com");
  }

  function operatorSends() {
    return sendEmailMock.mock.calls
      .map((c) => c[0])
      .filter((e) => e.to === "ops@example.com");
  }

  it("reports disabled and touches nothing without config", async () => {
    await seed();
    clearAgentEnv();
    const result = await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => ({ verdict: "approve" })),
    });
    expect(result.disabled).toBe(true);
    expect((await publication()).published_at).toBeNull();
  });

  it("approves as system on an approve verdict", async () => {
    await seed();
    const result = await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => ({
        verdict: "approve",
        reasons: [],
      })),
    });

    expect(result).toMatchObject({ processed: 1, approved: 1, rejected: 0 });
    const row = await publication();
    expect(row.published_at).toBeTruthy();
    expect(row.approved_by).toBe("system");
    expect(row.review_attempts).toBe(1);
    const request = await t.serviceDb
      .selectFrom("game_publication_requests")
      .select("outcome")
      .executeTakeFirstOrThrow();
    expect(request.outcome).toBe("approved");
    // Approval sends no operator email; the publisher is told the good news.
    expect(operatorSends()).toHaveLength(0);
    expect(publisherSend().react.props.outcome).toBe("approved");
  });

  it("soft-rejects, stamps reasons and emails the operator", async () => {
    await seed();
    const result = await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject",
        reasons: [
          { code: "soft_contains_personal_information", note: "a real name" },
        ],
      })),
    });

    expect(result).toMatchObject({ processed: 1, rejected: 1 });
    const row = await publication();
    expect(row.rejected_at).toBeTruthy();
    expect(row.rejection_kind).toBe("soft");
    expect(row.rejection_reasons).toEqual([
      { code: "soft_contains_personal_information", note: "a real name" },
    ]);
    expect((await account()).flagged_for_review_at).toBeNull();
    expect(operatorSends()).toHaveLength(1);
  });

  it("any hard reason makes the rejection hard and flags the account", async () => {
    await seed();
    await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject",
        reasons: [
          { code: "soft_quality_below_bar", note: "broken" },
          { code: "hard_child_safety", note: "asks for a phone number" },
        ],
      })),
    });

    expect((await publication()).rejection_kind).toBe("hard");
    expect((await account()).flagged_for_review_at).toBeTruthy();
  });

  it("emails both the operator and the publisher on a soft rejection", async () => {
    await seed();
    await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject",
        reasons: [{ code: "soft_quality_below_bar", note: "broken" }],
      })),
    });
    const recipients = sendEmailMock.mock.calls.map((c) => c[0].to).sort();
    expect(recipients).toEqual(["ops@example.com", "parent@example.com"]);
    expect(publisherSend().react.props.outcome).toBe("soft");
    expect(publisherSend().react.props.reasons).toEqual([
      { code: "soft_quality_below_bar", note: "broken" },
    ]);
  });

  it("tells the publisher nothing about why on a hard rejection", async () => {
    await seed();
    await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject",
        reasons: [{ code: "hard_child_safety", note: "asks for a phone number" }],
      })),
    });
    expect(publisherSend().react.props.outcome).toBe("hard");
    expect(publisherSend().react.props.reasons).toEqual([]);
  });

  it("honours the publisher's opt-out of outcome email", async () => {
    await seed({}, { notificationPreferences: { publication_outcome_email: false } });
    await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => ({
        verdict: "approve",
        reasons: [],
      })),
    });
    expect(publisherSend()).toBeUndefined();
  });

  it("a provider error burns an attempt and leaves the item pending", async () => {
    await seed();
    const result = await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => {
        throw new Error("provider down");
      }),
    });

    expect(result).toMatchObject({ processed: 1, errors: 1, approved: 0 });
    const row = await publication();
    expect(row.published_at).toBeNull();
    expect(row.rejected_at).toBeNull();
    expect(row.review_attempts).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("a malformed verdict fails closed — never an approval", async () => {
    await seed();
    const result = await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject", // reject with no reasons violates the contract
        reasons: [],
      })),
    });

    expect(result.errors).toBe(1);
    const row = await publication();
    expect(row.published_at).toBeNull();
    expect(row.rejected_at).toBeNull();
  });

  it("an unknown rejection code fails closed too", async () => {
    await seed();
    const result = await processPendingPublications(t.serviceDb, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject",
        reasons: [{ code: "hard_invented_by_the_model", note: "" }],
      })),
    });
    expect(result.errors).toBe(1);
    expect((await publication()).rejected_at).toBeNull();
  });

  it("skips items whose attempt budget is exhausted", async () => {
    await seed({ review_attempts: MAX_REVIEW_ATTEMPTS });
    const factory = stubFactory(async () => ({ verdict: "approve" }));
    const result = await processPendingPublications(t.serviceDb, {
      providerFactory: factory,
    });

    expect(result.processed).toBe(0);
    expect(factory).not.toHaveBeenCalled();
    expect((await publication()).published_at).toBeNull();
  });

  it("only one of two concurrent workers claims the same item", async () => {
    await seed();
    // Both runs list the item while its counter is still 0; the compare-and-swap
    // on review_attempts lets exactly one of them claim it.
    const [first, second] = await Promise.all([
      processPendingPublications(t.serviceDb, {
        providerFactory: stubFactory(async () => ({ verdict: "approve", reasons: [] })),
      }),
      processPendingPublications(t.serviceDb, {
        providerFactory: stubFactory(async () => ({ verdict: "approve", reasons: [] })),
      }),
    ]);

    expect([first.processed, second.processed].sort()).toEqual([0, 1]);
    expect([first.skipped, second.skipped].sort()).toEqual([0, 1]);
    expect((await publication()).review_attempts).toBe(1);
  });

  it("counts a withdrawn-during-review item as skipped, not an error", async () => {
    await seed();
    const factory = stubFactory(async () => {
      // Withdrawal happens while the agent is thinking.
      await t.serviceDb.deleteFrom("games").where("id", "=", PUB_ID).execute();
      return { verdict: "reject", reasons: [{ code: "hard_child_safety", note: "" }] };
    });
    const result = await processPendingPublications(t.serviceDb, {
      providerFactory: factory,
    });
    expect(result).toMatchObject({ processed: 1, skipped: 1, rejected: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
