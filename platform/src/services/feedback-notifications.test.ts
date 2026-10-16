import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import { notifyFeedbackReceived } from "./feedback-notifications";
import { createFeedbackMessage } from "./feedback-messages";
import { createKid } from "./kids";

// Assert on the decision (who/what/whether), not a real Resend send.
const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }));

let t: TestDatabase;
let accountId: string;
let privateGame: string;

beforeAll(async () => {
  t = await createTestDb();
  accountId = await t.createAccount("parent@example.com");
  const kid = await createKid(t.serviceDb, {
    account_id: accountId,
    display_name: "enc:v1:name",
    social_id: "notify-1",
  });
  ({ id: privateGame } = await t.serviceDb
    .insertInto("games")
    .values({
      account_id: accountId,
      kid_id: kid.id,
      title: "enc:v1:secret-title",
      code_bundle: "enc:v1:bundle",
      created_by: "parent",
    })
    .returning("id")
    .executeTakeFirstOrThrow());
}, 60_000);

afterAll(async () => {
  await t?.close();
});

beforeEach(() => {
  sendEmailMock.mockReset().mockResolvedValue(true);
  process.env.SYSTEM_NOTIFICATION_EMAIL = "team@dodi.app";
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.SYSTEM_NOTIFICATION_EMAIL;
  vi.restoreAllMocks();
});

describe("notifyFeedbackReceived", () => {
  it("mails the operator inbox with Reply-To set to the parent", async () => {
    const feedback = await createFeedbackMessage(t.serviceDb, {
      accountId,
      senderName: "Sam",
      category: "feature_request",
      message: "Please add a drawing game.",
      gameId: null,
      clientPlatform: "web",
    });

    await notifyFeedbackReceived(t.serviceDb, feedback);

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const input = sendEmailMock.mock.calls[0]?.[0] as { to: string; replyTo: string; subject: string; react: { props: Record<string, unknown> } };
    expect(input.to).toBe("team@dodi.app");
    expect(input.replyTo).toBe("parent@example.com");
    expect(input.subject).toBe("dodi feedback: Feature request from Sam");
    expect(input.react.props).toMatchObject({
      feedbackId: feedback.id,
      accountId,
      accountEmail: "parent@example.com",
      message: "Please add a drawing game.",
    });
  });

  it("attaches the image as a file named after the message", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
    const feedback = await createFeedbackMessage(t.serviceDb, {
      accountId,
      senderName: "Sam",
      category: "bug_report",
      message: "See the screenshot.",
      gameId: null,
      clientPlatform: "web",
      image: { contentType: "image/jpeg", bytes },
    });

    await notifyFeedbackReceived(t.serviceDb, feedback, { contentType: "image/jpeg", bytes });

    const input = sendEmailMock.mock.calls[0]?.[0] as {
      attachments: { filename: string; content: Uint8Array; contentType: string }[];
      react: { props: Record<string, unknown> };
    };
    const filename = `feedback-${feedback.id.slice(0, 8)}.jpg`;
    expect(input.attachments).toEqual([{ filename, content: bytes, contentType: "image/jpeg" }]);
    expect(input.react.props).toMatchObject({ image: { filename, byteSize: 5 } });
  });

  it("sends no attachment without an image", async () => {
    const feedback = await createFeedbackMessage(t.serviceDb, {
      accountId,
      senderName: "Sam",
      category: "other",
      message: "Hello.",
      gameId: null,
      clientPlatform: "web",
    });

    await notifyFeedbackReceived(t.serviceDb, feedback);

    const input = sendEmailMock.mock.calls[0]?.[0] as Record<string, unknown> & {
      react: { props: Record<string, unknown> };
    };
    expect(input).not.toHaveProperty("attachments");
    expect(input.react.props).toMatchObject({ image: null });
  });

  it("names a private game by id only", async () => {
    const feedback = await createFeedbackMessage(t.serviceDb, {
      accountId,
      senderName: "Sam",
      category: "inappropriate_content",
      message: "Scary.",
      gameId: privateGame,
      clientPlatform: "mobile",
    });

    await notifyFeedbackReceived(t.serviceDb, feedback);

    const input = sendEmailMock.mock.calls[0]?.[0] as { react: { props: Record<string, unknown> } };
    expect(input.react.props).toMatchObject({ gameId: privateGame, gameTitle: null });
  });

  it("skips quietly when no operator inbox is configured", async () => {
    delete process.env.SYSTEM_NOTIFICATION_EMAIL;
    const feedback = await createFeedbackMessage(t.serviceDb, {
      accountId,
      senderName: "Sam",
      category: "other",
      message: "Hi.",
      gameId: null,
      clientPlatform: "web",
    });

    await notifyFeedbackReceived(t.serviceDb, feedback);

    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("never throws when sending fails", async () => {
    sendEmailMock.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const feedback = await createFeedbackMessage(t.serviceDb, {
      accountId,
      senderName: "Sam",
      category: "bug_report",
      message: "Crash.",
      gameId: null,
      clientPlatform: "web",
    });

    await expect(notifyFeedbackReceived(t.serviceDb, feedback)).resolves.toBeUndefined();
  });
});
