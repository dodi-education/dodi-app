import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestDb, type TestDatabase } from "@/test-support/pglite-db";

import {
  createFeedbackMessage,
  decodeFeedbackImage,
  FeedbackTargetError,
  getOpsFeedback,
  getOpsFeedbackCounts,
  getOpsFeedbackImage,
  listOpsFeedback,
  markFeedbackRead,
  publicGameTitle,
  reopenFeedback,
  solveFeedback,
} from "./feedback-messages";
import { createKid } from "./kids";

/**
 * Feedback messages against real PGlite: a message may name any game the
 * sender can see (own, system, live Discover), never another family's private
 * game, and private game titles never leak into the operator's view. The ops
 * inbox lists, counts and moves messages through read / solved, an attached
 * image is stored with its message or not at all, and the migration carries
 * the old content reports over.
 */
let t: TestDatabase;
let seq = 0;

beforeAll(async () => {
  t = await createTestDb();
}, 60_000);

afterAll(async () => {
  await t?.close();
});

async function family(): Promise<{ accountId: string; kidId: string; email: string }> {
  seq += 1;
  const email = `sender-${seq}@example.com`;
  const accountId = await t.createAccount(email);
  const kid = await createKid(t.serviceDb, {
    account_id: accountId,
    display_name: "enc:v1:name",
    social_id: `feedback-${seq}`,
  });
  return { accountId, kidId: kid.id, email };
}

async function game(accountId: string, kidId: string, published = false): Promise<string> {
  seq += 1;
  const now = new Date().toISOString();
  const { id } = await t.serviceDb
    .insertInto("games")
    .values({
      account_id: accountId,
      kid_id: kidId,
      title: published ? `Published game ${seq}` : `enc:v1:private-${seq}`,
      code_bundle: published ? "<html></html>" : "enc:v1:bundle",
      created_by: "parent",
      ...(published
        ? { publication_requested_at: now, published_at: now, approved_by: "system" as const }
        : {}),
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  return id;
}

/** The smallest thing that passes for each type: its signature and a few bytes. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);

function dataUrl(type: string, bytes: Uint8Array | string): string {
  return `data:${type};base64,${Buffer.from(bytes).toString("base64")}`;
}

const BASE = {
  senderName: "Sam",
  category: "bug_report" as const,
  message: "The game froze after level two.",
  gameId: null,
  clientPlatform: "web" as const,
};

describe("createFeedbackMessage", () => {
  it("stores an unread, open message for the sender", async () => {
    const { accountId } = await family();

    const feedback = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });

    expect(feedback).toMatchObject({
      account_id: accountId,
      sender_name: "Sam",
      category: "bug_report",
      message: BASE.message,
      game_id: null,
      client_platform: "web",
      read_at: null,
      solved_at: null,
      solved_by_staff_email: null,
    });
  });

  it("accepts another family's live Discover game", async () => {
    const publisher = await family();
    const sender = await family();
    const published = await game(publisher.accountId, publisher.kidId, true);

    const feedback = await createFeedbackMessage(t.serviceDb, {
      ...BASE,
      accountId: sender.accountId,
      category: "inappropriate_content",
      gameId: published,
    });

    expect(feedback.game_id).toBe(published);
    expect(await publicGameTitle(t.serviceDb, published)).toMatch(/^Published game/);
  });

  it("refuses another family's private game", async () => {
    const other = await family();
    const sender = await family();
    const privateGame = await game(other.accountId, other.kidId);

    await expect(
      createFeedbackMessage(t.serviceDb, { ...BASE, accountId: sender.accountId, gameId: privateGame }),
    ).rejects.toBeInstanceOf(FeedbackTargetError);
  });

  it("never hands a private game's sealed title to the operator view", async () => {
    const { accountId, kidId } = await family();
    const privateGame = await game(accountId, kidId);
    const feedback = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId, gameId: privateGame });

    expect(await publicGameTitle(t.serviceDb, privateGame)).toBeNull();
    const detail = await getOpsFeedback(t.serviceDb, feedback.id);
    expect(detail?.gameId).toBe(privateGame);
    expect(detail?.gameTitle).toBeNull();
  });

  it("keeps the message but clears the game when the game is deleted", async () => {
    const { accountId, kidId } = await family();
    const ownGame = await game(accountId, kidId);
    const feedback = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId, gameId: ownGame });

    await t.serviceDb.deleteFrom("games").where("id", "=", ownGame).execute();

    const detail = await getOpsFeedback(t.serviceDb, feedback.id);
    expect(detail?.gameId).toBeNull();
  });

  it("goes with the account when the account is deleted", async () => {
    const { accountId } = await family();
    const feedback = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });

    await t.serviceDb.deleteFrom("accounts").where("id", "=", accountId).execute();

    expect(await getOpsFeedback(t.serviceDb, feedback.id)).toBeNull();
  });
});

describe("the ops inbox", () => {
  it("lists newest first with the account email and a preview", async () => {
    const { accountId, email } = await family();
    const older = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId, message: "first" });
    const newer = await createFeedbackMessage(t.serviceDb, {
      ...BASE,
      accountId,
      category: "feature_request",
      message: "x".repeat(300),
    });
    await t.serviceDb
      .updateTable("feedback_messages")
      .set({ created_at: "2020-01-01T00:00:00Z" })
      .where("id", "=", older.id)
      .execute();

    const page = await listOpsFeedback(t.serviceDb, { state: "all", page: 1, limit: 100 });
    const mine = page.items.filter((item) => item.accountId === accountId);

    expect(mine.map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(mine[0]).toMatchObject({
      accountEmail: email,
      senderName: "Sam",
      category: "feature_request",
      clientPlatform: "web",
      hasImage: false,
      readAt: null,
      solvedAt: null,
    });
    expect(mine[0]?.messagePreview).toHaveLength(200);
    expect(page.total).toBe(page.items.length);
  });

  it("filters by state and bounds the page", async () => {
    const { accountId } = await family();
    const open = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });
    const solved = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });
    await solveFeedback(t.serviceDb, solved.id, "ops@dodi.app");

    const openIds = (await listOpsFeedback(t.serviceDb, { state: "open", page: 1, limit: 100 })).items.map(
      (item) => item.id,
    );
    const solvedIds = (
      await listOpsFeedback(t.serviceDb, { state: "solved", page: 1, limit: 100 })
    ).items.map((item) => item.id);
    expect(openIds).toContain(open.id);
    expect(openIds).not.toContain(solved.id);
    expect(solvedIds).toContain(solved.id);
    expect(solvedIds).not.toContain(open.id);

    const firstPage = await listOpsFeedback(t.serviceDb, { state: "all", page: 1, limit: 1 });
    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.total).toBeGreaterThan(1);
  });

  it("counts unread, open and solved messages", async () => {
    const before = await getOpsFeedbackCounts(t.serviceDb);
    const { accountId } = await family();
    const unread = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });
    const read = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });
    const solved = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });
    await markFeedbackRead(t.serviceDb, read.id);
    await solveFeedback(t.serviceDb, solved.id, "ops@dodi.app");

    const after = await getOpsFeedbackCounts(t.serviceDb);
    expect(after.unread - before.unread).toBe(1);
    expect(after.open - before.open).toBe(2);
    expect(after.solved - before.solved).toBe(1);
    expect(unread.read_at).toBeNull();

    const page = await listOpsFeedback(t.serviceDb, { state: "open", page: 1, limit: 1 });
    expect(page.counts).toEqual(after);
  });

  it("returns one message in full", async () => {
    const { accountId, email } = await family();
    const feedback = await createFeedbackMessage(t.serviceDb, {
      ...BASE,
      accountId,
      message: "line one\nline two",
      clientPlatform: "mobile",
    });

    expect(await getOpsFeedback(t.serviceDb, feedback.id)).toEqual({
      id: feedback.id,
      accountId,
      accountEmail: email,
      senderName: "Sam",
      category: "bug_report",
      message: "line one\nline two",
      gameId: null,
      gameTitle: null,
      clientPlatform: "mobile",
      image: null,
      createdAt: feedback.created_at,
      readAt: null,
      solvedAt: null,
      solvedByStaffEmail: null,
    });
    expect(await getOpsFeedback(t.serviceDb, "0d15c0de-0000-4000-8000-000000000001")).toBeNull();
  });
});

describe("read, solve and reopen", () => {
  it("marks read once and keeps the first time", async () => {
    const { accountId } = await family();
    const feedback = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });

    expect(await markFeedbackRead(t.serviceDb, feedback.id, new Date("2026-10-01T10:00:00Z"))).toBe("ok");
    expect(await markFeedbackRead(t.serviceDb, feedback.id, new Date("2026-10-02T10:00:00Z"))).toBe("ok");

    const detail = await getOpsFeedback(t.serviceDb, feedback.id);
    expect(new Date(detail?.readAt ?? "").toISOString()).toBe("2026-10-01T10:00:00.000Z");
    expect(await markFeedbackRead(t.serviceDb, "0d15c0de-0000-4000-8000-000000000001")).toBe("not_found");
  });

  it("solves an unread message, which also marks it read", async () => {
    const { accountId } = await family();
    const feedback = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });

    expect(await solveFeedback(t.serviceDb, feedback.id, "ops@dodi.app")).toBe("ok");

    const detail = await getOpsFeedback(t.serviceDb, feedback.id);
    expect(detail?.solvedAt).not.toBeNull();
    expect(detail?.readAt).not.toBeNull();
    expect(detail?.solvedByStaffEmail).toBe("ops@dodi.app");
  });

  it("refuses to solve twice and to reopen an open message", async () => {
    const { accountId } = await family();
    const feedback = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });

    expect(await reopenFeedback(t.serviceDb, feedback.id)).toBe("not_solved");
    await solveFeedback(t.serviceDb, feedback.id, "ops@dodi.app");
    expect(await solveFeedback(t.serviceDb, feedback.id, "other@dodi.app")).toBe("already_solved");
    expect((await getOpsFeedback(t.serviceDb, feedback.id))?.solvedByStaffEmail).toBe("ops@dodi.app");
  });

  it("reopens a solved message, which stays read", async () => {
    const { accountId } = await family();
    const feedback = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });
    await solveFeedback(t.serviceDb, feedback.id, "ops@dodi.app");

    expect(await reopenFeedback(t.serviceDb, feedback.id)).toBe("ok");

    const detail = await getOpsFeedback(t.serviceDb, feedback.id);
    expect(detail?.solvedAt).toBeNull();
    expect(detail?.solvedByStaffEmail).toBeNull();
    expect(detail?.readAt).not.toBeNull();
  });

  it("answers not_found for a message that does not exist", async () => {
    const missing = "0d15c0de-0000-4000-8000-000000000001";
    expect(await solveFeedback(t.serviceDb, missing, "ops@dodi.app")).toBe("not_found");
    expect(await reopenFeedback(t.serviceDb, missing)).toBe("not_found");
  });
});

describe("decodeFeedbackImage", () => {
  it("decodes an image whose bytes are what its label says", () => {
    const jpeg = decodeFeedbackImage(dataUrl("image/jpeg", JPEG));
    expect(jpeg?.contentType).toBe("image/jpeg");
    expect([...(jpeg?.bytes ?? [])]).toEqual([...JPEG]);
    expect(decodeFeedbackImage(dataUrl("image/png", PNG))?.contentType).toBe("image/png");
  });

  it("refuses a label the bytes do not match, and markup posing as an image", () => {
    expect(decodeFeedbackImage(dataUrl("image/png", JPEG))).toBeNull();
    expect(decodeFeedbackImage(dataUrl("image/jpeg", "<svg onload=alert(1)>"))).toBeNull();
    expect(decodeFeedbackImage(dataUrl("image/webp", "<html></html>"))).toBeNull();
    expect(decodeFeedbackImage("data:image/jpeg;base64,")).toBeNull();
  });
});

describe("attached images", () => {
  it("stores the image with its message and shows it to the ops console", async () => {
    const { accountId } = await family();
    const feedback = await createFeedbackMessage(t.serviceDb, {
      ...BASE,
      accountId,
      image: { contentType: "image/jpeg", bytes: JPEG },
    });
    const plain = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });

    const rows = (await listOpsFeedback(t.serviceDb, { state: "all", page: 1, limit: 100 })).items;
    expect(rows.find((row) => row.id === feedback.id)?.hasImage).toBe(true);
    expect(rows.find((row) => row.id === plain.id)?.hasImage).toBe(false);
    expect((await getOpsFeedback(t.serviceDb, feedback.id))?.image).toEqual({
      contentType: "image/jpeg",
      byteSize: JPEG.byteLength,
    });

    const image = await getOpsFeedbackImage(t.serviceDb, feedback.id);
    expect(image?.contentType).toBe("image/jpeg");
    expect([...(image?.bytes ?? [])]).toEqual([...JPEG]);
    expect(await getOpsFeedbackImage(t.serviceDb, plain.id)).toBeNull();
  });

  it("stores neither the message nor the image when the image is refused", async () => {
    const { accountId } = await family();
    const tooLarge = new Uint8Array(2 * 1024 * 1024 + 1);
    tooLarge.set(JPEG);

    await expect(
      createFeedbackMessage(t.serviceDb, {
        ...BASE,
        accountId,
        image: { contentType: "image/jpeg", bytes: tooLarge },
      }),
    ).rejects.toThrow();

    const stored = await t.serviceDb
      .selectFrom("feedback_messages")
      .select("id")
      .where("account_id", "=", accountId)
      .execute();
    expect(stored).toEqual([]);
  });

  it("goes with its message", async () => {
    const { accountId } = await family();
    const feedback = await createFeedbackMessage(t.serviceDb, {
      ...BASE,
      accountId,
      image: { contentType: "image/png", bytes: PNG },
    });

    await t.serviceDb.deleteFrom("accounts").where("id", "=", accountId).execute();

    expect(await getOpsFeedbackImage(t.serviceDb, feedback.id)).toBeNull();
  });
});

describe("row-level security", () => {
  it("lets a parent send feedback for their own account only", async () => {
    const sender = await family();
    const other = await family();
    const values = {
      sender_name: "Sam",
      category: "other" as const,
      message: "Hello",
      client_platform: "web" as const,
    };

    await t.scopedDb(sender.accountId).insertInto("feedback_messages").values({ ...values, account_id: sender.accountId }).execute();
    await expect(
      t.scopedDb(sender.accountId).insertInto("feedback_messages").values({ ...values, account_id: other.accountId }).execute(),
    ).rejects.toThrow();
  });

  it("never lets a parent write the staff state", async () => {
    const { accountId } = await family();
    await expect(
      t
        .scopedDb(accountId)
        .insertInto("feedback_messages")
        .values({
          account_id: accountId,
          sender_name: "Sam",
          category: "other",
          message: "Hello",
          client_platform: "web",
          read_at: new Date().toISOString(),
        })
        .execute(),
    ).rejects.toThrow();

    const feedback = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId });
    const res = await t
      .scopedDb(accountId)
      .updateTable("feedback_messages")
      .set({ solved_at: new Date().toISOString(), read_at: new Date().toISOString() })
      .where("id", "=", feedback.id)
      .executeTakeFirst();
    expect(Number(res.numUpdatedRows)).toBe(0);
  });
});

describe("row-level security of attached images", () => {
  it("lets a parent see and attach images on their own messages only", async () => {
    const sender = await family();
    const other = await family();
    const mine = await createFeedbackMessage(t.serviceDb, { ...BASE, accountId: sender.accountId });
    const theirs = await createFeedbackMessage(t.serviceDb, {
      ...BASE,
      accountId: other.accountId,
      image: { contentType: "image/jpeg", bytes: JPEG },
    });
    const values = { content_type: "image/jpeg" as const, byte_size: JPEG.byteLength, image_bytes: JPEG };

    await t
      .scopedDb(sender.accountId)
      .insertInto("feedback_message_images")
      .values({ ...values, feedback_message_id: mine.id })
      .execute();
    await expect(
      t
        .scopedDb(sender.accountId)
        .insertInto("feedback_message_images")
        .values({ ...values, feedback_message_id: theirs.id })
        .execute(),
    ).rejects.toThrow();

    const visible = await t
      .scopedDb(sender.accountId)
      .selectFrom("feedback_message_images")
      .select("feedback_message_id")
      .execute();
    expect(visible.map((row) => row.feedback_message_id)).toEqual([mine.id]);
  });
});

describe("feedback_messages migration", () => {
  it("carries the old content reports over as inappropriate content", async () => {
    const old = await createTestDb({ upTo: "20261011100000_agent_studio_scope" });
    try {
      const accountId = await old.createAccount("carry-over@example.com");
      const db = old.serviceDb as unknown as Kysely<Record<string, Record<string, unknown>>>;
      const { id: kidId } = (await db
        .insertInto("kids")
        .values({ account_id: accountId, display_name: "enc:v1:k", social_id: "CO-1" })
        .returning("id")
        .executeTakeFirstOrThrow()) as { id: string };
      const { id: gameId } = (await db
        .insertInto("games")
        .values({
          account_id: accountId,
          kid_id: kidId,
          title: "enc:v1:t",
          code_bundle: "enc:v1:b",
          created_by: "parent",
        })
        .returning("id")
        .executeTakeFirstOrThrow()) as { id: string };
      const resolvedAt = "2026-10-10T08:00:00.000Z";
      const openReport = "0d15c0de-0000-4000-8000-0000000000a1";
      const resolvedReport = "0d15c0de-0000-4000-8000-0000000000a2";
      await db
        .insertInto("content_reports")
        .values([
          {
            id: openReport,
            account_id: accountId,
            kid_id: kidId,
            content_kind: "companion_answer",
            reason: "upsetting",
            details: "  It talked about monsters.  ",
            client_platform: "mobile",
          },
          {
            id: resolvedReport,
            account_id: accountId,
            game_id: gameId,
            content_kind: "game",
            reason: "wrong",
            details: null,
            client_platform: "web",
            resolved_at: resolvedAt,
          },
        ])
        .execute();

      await old.migrateToLatest();

      const open = await getOpsFeedback(old.serviceDb, openReport);
      expect(open).toMatchObject({
        accountId,
        senderName: null,
        category: "inappropriate_content",
        message: "Report a problem: something the companion said, scary or upsetting.\n\nIt talked about monsters.",
        gameId: null,
        clientPlatform: "mobile",
        readAt: null,
        solvedAt: null,
      });
      const resolved = await getOpsFeedback(old.serviceDb, resolvedReport);
      expect(resolved).toMatchObject({
        message: "Report a problem: a game in the family's library, wrong or misleading.",
        gameId,
        clientPlatform: "web",
      });
      expect(new Date(resolved?.readAt ?? "").toISOString()).toBe(resolvedAt);
      expect(new Date(resolved?.solvedAt ?? "").toISOString()).toBe(resolvedAt);

      await expect(db.selectFrom("content_reports").select("id").execute()).rejects.toThrow();
    } finally {
      await old.close();
    }
  }, 60_000);
});
