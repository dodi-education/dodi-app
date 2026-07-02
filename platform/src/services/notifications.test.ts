import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database, Friendship } from "@dodi/types/database";

import { friendApprovalCopy } from "@/emails/strings";

import { notifyPendingApproval } from "./notifications";

// Mock the email transport so we assert on *decisions*, not real Resend sends.
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

interface FakeAccount {
  id: string;
  email: string | null;
  language: string | null;
  notification_preferences: unknown;
}

/** Minimal fake of the one query notifyPendingApproval makes. */
function fakeSupabase(
  accounts: FakeAccount[],
  opts: { error?: string } = {},
): SupabaseClient<Database> {
  return {
    from: () => ({
      select: () => ({
        in: (_col: string, ids: string[]) =>
          Promise.resolve(
            opts.error
              ? { data: null, error: { message: opts.error } }
              : {
                  data: accounts.filter((a) => ids.includes(a.id)),
                  error: null,
                },
          ),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

function friendship(overrides: Partial<Friendship>): Friendship {
  return {
    requester_account_id: "acc-req",
    addressee_account_id: "acc-addr",
    requester_parent_ok: null,
    addressee_parent_ok: null,
    ...overrides,
  } as Friendship;
}

const account = (over: Partial<FakeAccount> & { id: string }): FakeAccount => ({
  email: `${over.id}@example.com`,
  language: "en",
  notification_preferences: {},
  ...over,
});

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(true);
  process.env.NEXT_PUBLIC_APP_URL = "https://app.dodi.app";
});

describe("notifyPendingApproval", () => {
  it("emails only the side(s) whose parent approval is pending", async () => {
    const supabase = fakeSupabase([
      account({ id: "acc-req" }),
      account({ id: "acc-addr" }),
    ]);
    // Only the addressee's parent must approve.
    await notifyPendingApproval(
      supabase,
      friendship({ addressee_parent_ok: false }),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("acc-addr@example.com");
  });

  it("emails both parents when both sides are pending", async () => {
    const supabase = fakeSupabase([
      account({ id: "acc-req" }),
      account({ id: "acc-addr" }),
    ]);
    await notifyPendingApproval(
      supabase,
      friendship({ requester_parent_ok: false, addressee_parent_ok: false }),
    );

    const recipients = sendEmailMock.mock.calls.map((c) => c[0].to).sort();
    expect(recipients).toEqual(["acc-addr@example.com", "acc-req@example.com"]);
  });

  it("dedupes to a single email when both sides are the same account", async () => {
    const supabase = fakeSupabase([account({ id: "acc-solo" })]);
    await notifyPendingApproval(
      supabase,
      friendship({
        requester_account_id: "acc-solo",
        addressee_account_id: "acc-solo",
        requester_parent_ok: false,
        addressee_parent_ok: false,
      }),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("suppresses the email when the toggle is off", async () => {
    const supabase = fakeSupabase([
      account({
        id: "acc-addr",
        notification_preferences: { friend_approval_email: false },
      }),
    ]);
    await notifyPendingApproval(
      supabase,
      friendship({ addressee_parent_ok: false }),
    );

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("sends when the toggle is absent (opt-out default is on)", async () => {
    const supabase = fakeSupabase([
      account({ id: "acc-addr", notification_preferences: null }),
    ]);
    await notifyPendingApproval(
      supabase,
      friendship({ addressee_parent_ok: false }),
    );

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it("localizes the subject to the account's language", async () => {
    const supabase = fakeSupabase([account({ id: "acc-addr", language: "de" })]);
    await notifyPendingApproval(
      supabase,
      friendship({ addressee_parent_ok: false }),
    );

    expect(sendEmailMock.mock.calls[0][0].subject).toBe(
      friendApprovalCopy("de").subject,
    );
  });

  it("does nothing when no side needs approval", async () => {
    const supabase = fakeSupabase([account({ id: "acc-addr" })]);
    await notifyPendingApproval(supabase, friendship({}));
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("never throws when the account lookup fails", async () => {
    const supabase = fakeSupabase([], { error: "boom" });
    await expect(
      notifyPendingApproval(supabase, friendship({ addressee_parent_ok: false })),
    ).resolves.toBeUndefined();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
