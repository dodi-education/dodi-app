import { randomUUID } from "node:crypto";

import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database, Game, Json } from "@dodi/types/database";

import { publicationOutcomeCopy } from "@/emails/strings";
import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import {
  notifyPublisherApproved,
  notifyPublisherRejected,
} from "./publication-notifications";

// Assert on the decision (who/what/whether), not a real Resend send.
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

let t: TestDatabase;
/** The publisher's real account (email parent@example.com). */
let account: string;

beforeAll(async () => {
  t = await createTestDb();
  account = await t.createAccount("parent@example.com");
}, 60_000);

afterAll(async () => {
  await t?.close();
});

/** A handle whose every query fails: exercises the "never throws" contract. */
function failingDb(): Kysely<Database> {
  return new Kysely<Database>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createQueryCompiler: () => new PostgresQueryCompiler(),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createDriver: () => ({
        init: async () => {},
        acquireConnection: async () => {
          throw new Error("boom");
        },
        beginTransaction: async () => {},
        commitTransaction: async () => {},
        rollbackTransaction: async () => {},
        releaseConnection: async () => {},
        destroy: async () => {},
      }),
    },
  });
}

function publication(overrides: Partial<Game> = {}): Game {
  return {
    id: "pub-1",
    account_id: account,
    published_by_account_id: account,
    source_game_id: "game-1",
    title: "Counting Comets",
    ...overrides,
  } as Game;
}

/** Override the publisher's plaintext columns (language/prefs) per test. */
async function setAccount(fields: {
  language?: string;
  notification_preferences?: Json;
}): Promise<void> {
  await t.serviceDb
    .updateTable("accounts")
    .set({
      language: fields.language ?? "en",
      notification_preferences: fields.notification_preferences ?? {},
    })
    .where("id", "=", account)
    .execute();
}

/** The one send this notifier makes, for terse assertions. */
function lastSend() {
  return sendEmailMock.mock.calls.at(-1)?.[0];
}

beforeEach(async () => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(true);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.dodi.app";
  await setAccount({});
});

describe("notifyPublisherApproved", () => {
  it("emails the publisher a detail-free approval", async () => {
    await notifyPublisherApproved(t.serviceDb, publication());

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(lastSend().to).toBe("parent@example.com");
    expect(lastSend().subject).toBe(publicationOutcomeCopy("en").approvedSubject);
    expect(lastSend().react.props.outcome).toBe("approved");
    expect(lastSend().react.props.reasons).toEqual([]);
  });

  it("localizes the subject to the publisher's language", async () => {
    await setAccount({ language: "de" });
    await notifyPublisherApproved(t.serviceDb, publication());
    expect(lastSend().subject).toBe(publicationOutcomeCopy("de").approvedSubject);
  });

  it("falls back to account_id when published_by_account_id is null", async () => {
    await notifyPublisherApproved(
      t.serviceDb,
      publication({ published_by_account_id: null }),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("notifyPublisherRejected", () => {
  it("passes the reasons and a resubmit path on a soft rejection", async () => {
    const reasons = [
      { code: "soft_quality_below_bar" as const, note: "broken" },
    ];
    await notifyPublisherRejected(t.serviceDb, publication(), "soft", reasons);

    expect(lastSend().subject).toBe(publicationOutcomeCopy("en").softSubject);
    expect(lastSend().react.props.outcome).toBe("soft");
    expect(lastSend().react.props.reasons).toEqual(reasons);
    expect(lastSend().react.props.sourceGameId).toBe("game-1");
  });

  it("shares NO reasons on a hard rejection (details are dropped, not hidden)", async () => {
    const reasons = [
      { code: "hard_child_safety" as const, note: "asked for a phone number" },
    ];
    await notifyPublisherRejected(t.serviceDb, publication(), "hard", reasons);

    expect(lastSend().subject).toBe(publicationOutcomeCopy("en").hardSubject);
    expect(lastSend().react.props.outcome).toBe("hard");
    expect(lastSend().react.props.reasons).toEqual([]);
  });
});

describe("publisher-email gating", () => {
  it("suppresses the email when the toggle is off", async () => {
    await setAccount({
      notification_preferences: { publication_outcome_email: false },
    });
    await notifyPublisherApproved(t.serviceDb, publication());
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends when the toggle is absent (opt-out default is on)", async () => {
    await setAccount({ notification_preferences: {} });
    await notifyPublisherApproved(t.serviceDb, publication());
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("never throws when the account row is missing", async () => {
    const missing = randomUUID();
    await expect(
      notifyPublisherApproved(
        t.serviceDb,
        publication({ account_id: missing, published_by_account_id: missing }),
      ),
    ).resolves.toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("never throws when the account lookup fails", async () => {
    await expect(
      notifyPublisherRejected(failingDb(), publication(), "soft", []),
    ).resolves.toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
