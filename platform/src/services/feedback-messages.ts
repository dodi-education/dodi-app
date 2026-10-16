/**
 * "Give feedback": the messages parents send the dodi team from the app, and
 * the ops console's inbox over them.
 *
 * A message is plaintext on purpose (the parent writes to the operator), so
 * the console may read its text. The one sealed thing it can point at is a
 * game: a title is only ever shown for plaintext games (system or Discover),
 * never a private game's ciphertext.
 */
import { sql } from "kysely";
import { z } from "zod/v4";

import type { FeedbackCategory, FeedbackClientPlatform, FeedbackMessage } from "@dodi/types/database";

import type { Db } from "@/lib/db";

import { OPS_LIST_DEFAULT_LIMIT, OPS_LIST_MAX_LIMIT } from "./ops-lists";

export interface FeedbackMessageInput {
  accountId: string;
  senderName: string;
  category: FeedbackCategory;
  message: string;
  gameId: string | null;
  clientPlatform: FeedbackClientPlatform;
}

/** A game id in the message that the sender cannot refer to. */
export class FeedbackTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedbackTargetError";
  }
}

/**
 * Store a message. Runs on the service handle, scoped to the sender: the game
 * must be one they can see, which is their own, a system game or a live
 * Discover game (a report about a Discover game points at another family's
 * published row, which RLS would hide).
 */
export async function createFeedbackMessage(
  db: Db,
  input: FeedbackMessageInput,
): Promise<FeedbackMessage> {
  if (input.gameId) {
    const game = await db
      .selectFrom("games")
      .select("id")
      .where("id", "=", input.gameId)
      .where((eb) =>
        eb.or([
          eb("account_id", "=", input.accountId),
          eb("is_system", "=", true),
          eb("published_at", "is not", null),
        ]),
      )
      .executeTakeFirst();
    if (!game) throw new FeedbackTargetError("Unknown game");
  }

  return db
    .insertInto("feedback_messages")
    .values({
      account_id: input.accountId,
      sender_name: input.senderName,
      category: input.category,
      message: input.message,
      game_id: input.gameId,
      client_platform: input.clientPlatform,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * The operator's view of a game named in a message: its public title when the
 * game is plaintext (system or Discover), never a private (sealed) game's fields.
 */
export async function publicGameTitle(db: Db, gameId: string): Promise<string | null> {
  const game = await db
    .selectFrom("games")
    .select(["title", "is_system", "publication_requested_at"])
    .where("id", "=", gameId)
    .executeTakeFirst();
  if (!game) return null;
  const isPlaintext = game.is_system || game.publication_requested_at !== null;
  return isPlaintext ? game.title : null;
}

// ---------------------------------------------------------------------------
// Ops console: GET /api/internal/feedback (+ /counts, /[id]) and the
// read / solve / reopen mutations. Cross-account reads on the service handle,
// so every list is bounded by the page limit.
// ---------------------------------------------------------------------------

export const OPS_FEEDBACK_STATE_FILTERS = ["open", "solved", "all"] as const;
export type OpsFeedbackStateFilter = (typeof OPS_FEEDBACK_STATE_FILTERS)[number];

export const OpsFeedbackQuerySchema = z.object({
  state: z.enum(OPS_FEEDBACK_STATE_FILTERS).default("open"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(OPS_LIST_MAX_LIMIT)
    .default(OPS_LIST_DEFAULT_LIMIT),
});
export type OpsFeedbackQuery = z.infer<typeof OpsFeedbackQuerySchema>;

/** How much of a message the list shows. */
const PREVIEW_LENGTH = 200;

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsFeedbackCounts {
  unread: number;
  open: number;
  solved: number;
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsFeedbackRow {
  id: string;
  accountId: string;
  accountEmail: string;
  /** NULL only on messages carried over from the old content reports. */
  senderName: string | null;
  category: FeedbackCategory;
  messagePreview: string;
  gameId: string | null;
  clientPlatform: FeedbackClientPlatform;
  createdAt: string;
  readAt: string | null;
  solvedAt: string | null;
  solvedByStaffEmail: string | null;
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsFeedbackListResponse {
  items: OpsFeedbackRow[];
  page: number;
  limit: number;
  total: number;
  counts: OpsFeedbackCounts;
}

// SYNC TOUCHPOINT: dodi-com/core/ops-contract/src/platform.ts
export interface OpsFeedbackDetail extends Omit<OpsFeedbackRow, "messagePreview"> {
  message: string;
  /** The game's public title; NULL for a private or deleted game. */
  gameTitle: string | null;
}

/** The console's badge and filter numbers, in one scan. */
export async function getOpsFeedbackCounts(db: Db): Promise<OpsFeedbackCounts> {
  const { rows } = await sql<{ unread: number; open: number; solved: number }>`
    select count(*) filter (where read_at is null)::int as unread,
           count(*) filter (where solved_at is null)::int as open,
           count(*) filter (where solved_at is not null)::int as solved
    from feedback_messages
  `.execute(db);
  const row = rows[0];
  return {
    unread: Number(row?.unread ?? 0),
    open: Number(row?.open ?? 0),
    solved: Number(row?.solved ?? 0),
  };
}

/** The inbox, newest first. */
export async function listOpsFeedback(
  db: Db,
  query: OpsFeedbackQuery,
): Promise<OpsFeedbackListResponse> {
  let base = db
    .selectFrom("feedback_messages as f")
    .innerJoin("accounts as a", "a.id", "f.account_id");
  if (query.state === "open") base = base.where("f.solved_at", "is", null);
  if (query.state === "solved") base = base.where("f.solved_at", "is not", null);

  const [counts, totalRow, rows] = await Promise.all([
    getOpsFeedbackCounts(db),
    base.select((eb) => eb.fn.countAll<number>().as("total")).executeTakeFirst(),
    base
      .select([
        "f.id",
        "f.account_id",
        "a.email as account_email",
        "f.sender_name",
        "f.category",
        sql<string>`left(f.message, ${PREVIEW_LENGTH})`.as("message_preview"),
        "f.game_id",
        "f.client_platform",
        "f.created_at",
        "f.read_at",
        "f.solved_at",
        "f.solved_by_staff_email",
      ])
      .orderBy("f.created_at", "desc")
      .orderBy("f.id", "asc")
      .limit(query.limit)
      .offset((query.page - 1) * query.limit)
      .execute(),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      accountEmail: row.account_email,
      senderName: row.sender_name,
      category: row.category,
      messagePreview: row.message_preview,
      gameId: row.game_id,
      clientPlatform: row.client_platform,
      createdAt: row.created_at,
      readAt: row.read_at,
      solvedAt: row.solved_at,
      solvedByStaffEmail: row.solved_by_staff_email,
    })),
    page: query.page,
    limit: query.limit,
    total: Number(totalRow?.total ?? 0),
    counts,
  };
}

/** One message in full, or null when it does not exist. */
export async function getOpsFeedback(db: Db, id: string): Promise<OpsFeedbackDetail | null> {
  const row = await db
    .selectFrom("feedback_messages as f")
    .innerJoin("accounts as a", "a.id", "f.account_id")
    .select([
      "f.id",
      "f.account_id",
      "a.email as account_email",
      "f.sender_name",
      "f.category",
      "f.message",
      "f.game_id",
      "f.client_platform",
      "f.created_at",
      "f.read_at",
      "f.solved_at",
      "f.solved_by_staff_email",
    ])
    .where("f.id", "=", id)
    .executeTakeFirst();
  if (!row) return null;

  return {
    id: row.id,
    accountId: row.account_id,
    accountEmail: row.account_email,
    senderName: row.sender_name,
    category: row.category,
    message: row.message,
    gameId: row.game_id,
    gameTitle: row.game_id ? await publicGameTitle(db, row.game_id) : null,
    clientPlatform: row.client_platform,
    createdAt: row.created_at,
    readAt: row.read_at,
    solvedAt: row.solved_at,
    solvedByStaffEmail: row.solved_by_staff_email,
  };
}

/** What a staff action did: anything but ok changed nothing. */
export type FeedbackActionOutcome = "ok" | "not_found" | "already_solved" | "not_solved";

async function actionOutcome(
  db: Db,
  id: string,
  updated: bigint,
  conflict: "already_solved" | "not_solved",
): Promise<FeedbackActionOutcome> {
  if (Number(updated) > 0) return "ok";
  const exists = await db
    .selectFrom("feedback_messages")
    .select("id")
    .where("id", "=", id)
    .executeTakeFirst();
  return exists ? conflict : "not_found";
}

/** Mark a message read (the first staff member to open it). Idempotent. */
export async function markFeedbackRead(
  db: Db,
  id: string,
  now: Date = new Date(),
): Promise<"ok" | "not_found"> {
  const res = await db
    .updateTable("feedback_messages")
    .set({ read_at: sql<string>`coalesce(read_at, ${now.toISOString()}::timestamptz)` })
    .where("id", "=", id)
    .executeTakeFirst();
  return Number(res.numUpdatedRows) > 0 ? "ok" : "not_found";
}

/** Mark an open message solved by `staffEmail`; solving also marks it read. */
export async function solveFeedback(
  db: Db,
  id: string,
  staffEmail: string,
  now: Date = new Date(),
): Promise<FeedbackActionOutcome> {
  const at = now.toISOString();
  const res = await db
    .updateTable("feedback_messages")
    .set({
      solved_at: at,
      solved_by_staff_email: staffEmail,
      read_at: sql<string>`coalesce(read_at, ${at}::timestamptz)`,
    })
    .where("id", "=", id)
    .where("solved_at", "is", null)
    .executeTakeFirst();
  return actionOutcome(db, id, res.numUpdatedRows, "already_solved");
}

/** Put a solved message back in the open inbox. It stays read. */
export async function reopenFeedback(db: Db, id: string): Promise<FeedbackActionOutcome> {
  const res = await db
    .updateTable("feedback_messages")
    .set({ solved_at: null, solved_by_staff_email: null })
    .where("id", "=", id)
    .where("solved_at", "is not", null)
    .executeTakeFirst();
  return actionOutcome(db, id, res.numUpdatedRows, "not_solved");
}
