import {
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database, Friendship, Json } from "@dodi/types/database";

import { friendApprovalCopy } from "@/emails/strings";
import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import { notifyPendingApproval } from "./notifications";

// Mock the email transport so we assert on *decisions*, not real Resend sends.
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

let t: TestDatabase;
/** Two real accounts: the friendship's requester and addressee side. */
let req: string;
let addr: string;

beforeAll(async () => {
  t = await createTestDb();
  req = await t.createAccount("acc-req@example.com");
  addr = await t.createAccount("acc-addr@example.com");
}, 60_000);

afterAll(async () => {
  await t?.close();
});

/** Reset the plaintext account fields a test may have changed. */
async function setAccount(
  id: string,
  fields: { language?: string; notification_preferences?: Json },
): Promise<void> {
  await t.serviceDb
    .updateTable("accounts")
    .set({
      language: fields.language ?? "en",
      notification_preferences: fields.notification_preferences ?? {},
    })
    .where("id", "=", id)
    .execute();
}

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

function friendship(overrides: Partial<Friendship>): Friendship {
  return {
    requester_account_id: req,
    addressee_account_id: addr,
    requester_parent_ok: null,
    addressee_parent_ok: null,
    ...overrides,
  } as Friendship;
}

beforeEach(async () => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(true);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.dodi.app";
  await setAccount(req, {});
  await setAccount(addr, {});
});

describe("notifyPendingApproval", () => {
  it("emails only the side(s) whose parent approval is pending", async () => {
    // Only the addressee's parent must approve.
    await notifyPendingApproval(
      t.serviceDb,
      friendship({ addressee_parent_ok: false }),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("acc-addr@example.com");
  });

  it("emails both parents when both sides are pending", async () => {
    await notifyPendingApproval(
      t.serviceDb,
      friendship({ requester_parent_ok: false, addressee_parent_ok: false }),
    );

    const recipients = sendEmailMock.mock.calls.map((c) => c[0].to).sort();
    expect(recipients).toEqual(["acc-addr@example.com", "acc-req@example.com"]);
  });

  it("dedupes to a single email when both sides are the same account", async () => {
    await notifyPendingApproval(
      t.serviceDb,
      friendship({
        requester_account_id: addr,
        addressee_account_id: addr,
        requester_parent_ok: false,
        addressee_parent_ok: false,
      }),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("suppresses the email when the toggle is off", async () => {
    await setAccount(addr, {
      notification_preferences: { friend_approval_email: false },
    });
    await notifyPendingApproval(
      t.serviceDb,
      friendship({ addressee_parent_ok: false }),
    );

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends when the toggle is absent (opt-out default is on)", async () => {
    await setAccount(addr, { notification_preferences: {} });
    await notifyPendingApproval(
      t.serviceDb,
      friendship({ addressee_parent_ok: false }),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("localizes the subject to the account's language", async () => {
    await setAccount(addr, { language: "de" });
    await notifyPendingApproval(
      t.serviceDb,
      friendship({ addressee_parent_ok: false }),
    );

    expect(sendEmailMock.mock.calls[0][0].subject).toBe(
      friendApprovalCopy("de").subject,
    );
  });

  it("defaults the email's app origin to app.dodi.app when the env is unset", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    await notifyPendingApproval(
      t.serviceDb,
      friendship({ addressee_parent_ok: false }),
    );
    // appUrl is passed to the email element; drives logo + dashboard/settings links.
    expect(sendEmailMock.mock.calls[0][0].react.props.appUrl).toBe(
      "https://app.dodi.app",
    );
  });

  it("uses NEXT_PUBLIC_APP_URL for the email's app origin when set", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://staging.dodi.app";
    await notifyPendingApproval(
      t.serviceDb,
      friendship({ addressee_parent_ok: false }),
    );
    expect(sendEmailMock.mock.calls[0][0].react.props.appUrl).toBe(
      "https://staging.dodi.app",
    );
  });

  it("does nothing when no side needs approval", async () => {
    await notifyPendingApproval(t.serviceDb, friendship({}));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("never throws when the account lookup fails", async () => {
    await expect(
      notifyPendingApproval(
        failingDb(),
        friendship({ addressee_parent_ok: false }),
      ),
    ).resolves.toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
