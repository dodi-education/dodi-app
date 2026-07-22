import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ThinkingProvider } from "@dodi/ai/thinking-providers/factory";

import { type Row, fakeDb } from "../test-support/fake-supabase";

// Assert on decisions, not real sends / real telemetry.
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));
vi.mock("@/lib/error-logs", () => ({ logServerError: vi.fn() }));

import {
  MAX_REVIEW_ATTEMPTS,
  loadReviewAgentConfig,
  processPendingPublications,
} from "./publication-review";

const ACCOUNT = "acc-1";

function pendingPublication(overrides: Row = {}): Row {
  return {
    id: "pub-1",
    account_id: ACCOUNT,
    published_by_account_id: ACCOUNT,
    source_game_id: "game-1",
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

/** The security agent now reads its config from the environment, not the DB. */
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

type Tables = {
  games: Row[];
  accounts: Row[];
  game_publication_requests: Row[];
};

function makeDb(tables: Partial<Tables> = {}) {
  return fakeDb<Tables>({
    games: [pendingPublication()],
    accounts: [
      {
        id: ACCOUNT,
        publication_handle: "fun_games",
        flagged_for_review_at: null,
      },
    ],
    game_publication_requests: [
      {
        id: "req-1",
        account_id: ACCOUNT,
        source_game_id: "game-1",
        publication_game_id: "pub-1",
        requested_at: "2026-07-22T10:00:00Z",
        outcome: null,
      },
    ],
    ...tables,
  });
}

/** The default account with a deliverable email + language, so the publisher
 *  notification actually sends (the base fixture omits an address on purpose). */
function accountsWithEmail(notification_preferences: Row = {}): Row[] {
  return [
    {
      id: ACCOUNT,
      publication_handle: "fun_games",
      flagged_for_review_at: null,
      email: "parent@example.com",
      language: "en",
      notification_preferences,
    },
  ];
}

/** The publisher-addressed send among a run's emails (operator + publisher). */
function publisherSend() {
  return sendEmailMock.mock.calls
    .map((c) => c[0])
    .find((e) => e.to === "parent@example.com");
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
  it("reports disabled and touches nothing without config", async () => {
    clearAgentEnv();
    const db = makeDb();
    const result = await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => ({ verdict: "approve" })),
    });
    expect(result.disabled).toBe(true);
    expect(db.tables.games[0].published_at).toBeNull();
  });

  it("approves as system on an approve verdict", async () => {
    const db = makeDb();
    const result = await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => ({
        verdict: "approve",
        reasons: [],
      })),
    });

    expect(result).toMatchObject({ processed: 1, approved: 1, rejected: 0 });
    expect(db.tables.games[0].published_at).toBeTruthy();
    expect(db.tables.games[0].approved_by).toBe("system");
    expect(db.tables.games[0].review_attempts).toBe(1);
    expect(db.tables.game_publication_requests[0].outcome).toBe("approved");
    // Approval sends no operator email, and this fixture's account has no
    // address on file, so the publisher notification is skipped too.
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("soft-rejects, stamps reasons and emails the operator", async () => {
    const db = makeDb();
    const result = await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject",
        reasons: [
          { code: "soft_contains_personal_information", note: "a real name" },
        ],
      })),
    });

    expect(result).toMatchObject({ processed: 1, rejected: 1 });
    expect(db.tables.games[0].rejected_at).toBeTruthy();
    expect(db.tables.games[0].rejection_kind).toBe("soft");
    expect(db.tables.games[0].rejection_reasons).toEqual([
      { code: "soft_contains_personal_information", note: "a real name" },
    ]);
    expect(db.tables.accounts[0].flagged_for_review_at).toBeNull();
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("ops@example.com");
  });

  it("any hard reason makes the rejection hard and flags the account", async () => {
    const db = makeDb();
    await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject",
        reasons: [
          { code: "soft_quality_below_bar", note: "broken" },
          { code: "hard_child_safety", note: "asks for a phone number" },
        ],
      })),
    });

    expect(db.tables.games[0].rejection_kind).toBe("hard");
    expect(db.tables.accounts[0].flagged_for_review_at).toBeTruthy();
  });

  it("emails the publisher when their submission is approved", async () => {
    const db = makeDb({ accounts: accountsWithEmail() });
    await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => ({
        verdict: "approve",
        reasons: [],
      })),
    });
    // Approval has no operator email, so the only send is the publisher's.
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(publisherSend().react.props.outcome).toBe("approved");
  });

  it("emails both the operator and the publisher on a soft rejection", async () => {
    const db = makeDb({ accounts: accountsWithEmail() });
    await processPendingPublications(db.client, {
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
    const db = makeDb({ accounts: accountsWithEmail() });
    await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject",
        reasons: [{ code: "hard_child_safety", note: "asks for a phone number" }],
      })),
    });
    expect(publisherSend().react.props.outcome).toBe("hard");
    expect(publisherSend().react.props.reasons).toEqual([]);
  });

  it("honours the publisher's opt-out of outcome email", async () => {
    const db = makeDb({
      accounts: accountsWithEmail({ publication_outcome_email: false }),
    });
    await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => ({
        verdict: "approve",
        reasons: [],
      })),
    });
    expect(publisherSend()).toBeUndefined();
  });

  it("a provider error burns an attempt and leaves the item pending", async () => {
    const db = makeDb();
    const result = await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => {
        throw new Error("provider down");
      }),
    });

    expect(result).toMatchObject({ processed: 1, errors: 1, approved: 0 });
    expect(db.tables.games[0].published_at).toBeNull();
    expect(db.tables.games[0].rejected_at).toBeNull();
    expect(db.tables.games[0].review_attempts).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("a malformed verdict fails closed — never an approval", async () => {
    const db = makeDb();
    const result = await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject", // reject with no reasons violates the contract
        reasons: [],
      })),
    });

    expect(result.errors).toBe(1);
    expect(db.tables.games[0].published_at).toBeNull();
    expect(db.tables.games[0].rejected_at).toBeNull();
  });

  it("an unknown rejection code fails closed too", async () => {
    const db = makeDb();
    const result = await processPendingPublications(db.client, {
      providerFactory: stubFactory(async () => ({
        verdict: "reject",
        reasons: [{ code: "hard_invented_by_the_model", note: "" }],
      })),
    });
    expect(result.errors).toBe(1);
    expect(db.tables.games[0].rejected_at).toBeNull();
  });

  it("skips items whose attempt budget is exhausted", async () => {
    const db = makeDb();
    db.tables.games[0].review_attempts = MAX_REVIEW_ATTEMPTS;
    const factory = stubFactory(async () => ({ verdict: "approve" }));
    const result = await processPendingPublications(db.client, {
      providerFactory: factory,
    });

    expect(result.processed).toBe(0);
    expect(factory).not.toHaveBeenCalled();
    expect(db.tables.games[0].published_at).toBeNull();
  });

  it("skips an item claimed by a concurrent worker (attempt counter moved)", async () => {
    const db = makeDb();
    const factory = stubFactory(async () => ({ verdict: "approve" }));
    // Simulate another worker bumping the counter between list and claim: the
    // fake's list returns live references, so pre-bump via a wrapped factory
    // is not possible — instead bump after listing by intercepting the claim.
    // Simplest deterministic simulation: make the row's counter differ from
    // what the claim predicate expects by bumping it now and handing the
    // service a stale copy through a custom from().
    const stale = { ...db.tables.games[0], review_attempts: 0 };
    db.tables.games[0].review_attempts = 1; // the other worker's claim
    let listed = false;
    const client = {
      from: (table: string) => {
        if (table === "games" && !listed) {
          listed = true;
          return {
            select: () => ({
              not: () => ({
                is: () => ({
                  is: () => ({
                    order: () => ({
                      limit: () => ({
                        lt: () => Promise.resolve({ data: [stale], error: null }),
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return (db.client as unknown as { from: (t: string) => unknown }).from(
          table,
        );
      },
    } as unknown as typeof db.client;

    const result = await processPendingPublications(client, {
      providerFactory: factory,
    });
    expect(result.skipped).toBe(1);
    expect(factory).not.toHaveBeenCalled();
  });

  it("counts a withdrawn-during-review item as skipped, not an error", async () => {
    const db = makeDb();
    const factory = stubFactory(async () => {
      // Withdrawal happens while the agent is thinking.
      db.tables.games.length = 0;
      return { verdict: "reject", reasons: [{ code: "hard_child_safety", note: "" }] };
    });
    const result = await processPendingPublications(db.client, {
      providerFactory: factory,
    });
    expect(result).toMatchObject({ processed: 1, skipped: 1, rejected: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
