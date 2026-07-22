import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Game } from "@dodi/types/database";

import { publicationOutcomeCopy } from "@/emails/strings";

import { type Row, fakeDb } from "../test-support/fake-supabase";
import {
  notifyPublisherApproved,
  notifyPublisherRejected,
} from "./publication-notifications";

// Assert on the decision (who/what/whether), not a real Resend send.
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

const ACCOUNT = "acc-1";

function publication(overrides: Partial<Game> = {}): Game {
  return {
    id: "pub-1",
    account_id: ACCOUNT,
    published_by_account_id: ACCOUNT,
    source_game_id: "game-1",
    title: "Counting Comets",
    ...overrides,
  } as Game;
}

/** One-account DB; override columns (email/language/prefs) per test. */
function makeDb(account: Row = {}) {
  return fakeDb<{ accounts: Row[] }>({
    accounts: [
      {
        id: ACCOUNT,
        email: "parent@example.com",
        language: "en",
        notification_preferences: {},
        ...account,
      },
    ],
  });
}

/** The one send this notifier makes, for terse assertions. */
function lastSend() {
  return sendEmailMock.mock.calls.at(-1)?.[0];
}

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(true);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.dodi.app";
});

describe("notifyPublisherApproved", () => {
  it("emails the publisher a detail-free approval", async () => {
    const db = makeDb();
    await notifyPublisherApproved(db.client, publication());

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(lastSend().to).toBe("parent@example.com");
    expect(lastSend().subject).toBe(publicationOutcomeCopy("en").approvedSubject);
    expect(lastSend().react.props.outcome).toBe("approved");
    expect(lastSend().react.props.reasons).toEqual([]);
  });

  it("localizes the subject to the publisher's language", async () => {
    const db = makeDb({ language: "de" });
    await notifyPublisherApproved(db.client, publication());
    expect(lastSend().subject).toBe(publicationOutcomeCopy("de").approvedSubject);
  });

  it("falls back to account_id when published_by_account_id is null", async () => {
    const db = makeDb();
    await notifyPublisherApproved(
      db.client,
      publication({ published_by_account_id: null }),
    );
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });
});

describe("notifyPublisherRejected", () => {
  it("passes the reasons and a resubmit path on a soft rejection", async () => {
    const db = makeDb();
    const reasons = [
      { code: "soft_quality_below_bar" as const, note: "broken" },
    ];
    await notifyPublisherRejected(db.client, publication(), "soft", reasons);

    expect(lastSend().subject).toBe(publicationOutcomeCopy("en").softSubject);
    expect(lastSend().react.props.outcome).toBe("soft");
    expect(lastSend().react.props.reasons).toEqual(reasons);
    expect(lastSend().react.props.sourceGameId).toBe("game-1");
  });

  it("shares NO reasons on a hard rejection (details are dropped, not hidden)", async () => {
    const db = makeDb();
    const reasons = [
      { code: "hard_child_safety" as const, note: "asked for a phone number" },
    ];
    await notifyPublisherRejected(db.client, publication(), "hard", reasons);

    expect(lastSend().subject).toBe(publicationOutcomeCopy("en").hardSubject);
    expect(lastSend().react.props.outcome).toBe("hard");
    expect(lastSend().react.props.reasons).toEqual([]);
  });
});

describe("publisher-email gating", () => {
  it("suppresses the email when the toggle is off", async () => {
    const db = makeDb({
      notification_preferences: { publication_outcome_email: false },
    });
    await notifyPublisherApproved(db.client, publication());
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends when the toggle is absent (opt-out default is on)", async () => {
    const db = makeDb({ notification_preferences: null });
    await notifyPublisherApproved(db.client, publication());
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("skips when the account has no email on file", async () => {
    const db = makeDb({ email: null });
    await notifyPublisherRejected(db.client, publication(), "soft", []);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("never throws when the account row is missing", async () => {
    const db = fakeDb<{ accounts: Row[] }>({ accounts: [] });
    await expect(
      notifyPublisherApproved(db.client, publication()),
    ).resolves.toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
