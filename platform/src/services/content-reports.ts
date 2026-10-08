import type { ContentReport, ContentReportKind, ContentReportReason } from "@dodi/types/database";

import type { Db } from "@/lib/db";

export interface ContentReportInput {
  accountId: string;
  contentKind: ContentReportKind;
  reason: ContentReportReason;
  details: string | null;
  kidId: string | null;
  gameId: string | null;
  clientPlatform: "web" | "mobile";
}

/** A kid or game id in the report that the reporter cannot refer to. */
export class ContentReportTargetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentReportTargetError";
  }
}

/**
 * File a report. Runs on the service handle, scoped to the reporter: the kid
 * must be theirs, and the game must be one they can see, which is their own,
 * a system game or a live Discover game (a report about a Discover game points
 * at another family's published row, which RLS would hide).
 */
export async function createContentReport(db: Db, input: ContentReportInput): Promise<ContentReport> {
  if (input.kidId) {
    const kid = await db
      .selectFrom("kids")
      .select("id")
      .where("id", "=", input.kidId)
      .where("account_id", "=", input.accountId)
      .executeTakeFirst();
    if (!kid) throw new ContentReportTargetError("Unknown kid");
  }
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
    if (!game) throw new ContentReportTargetError("Unknown game");
  }

  return db
    .insertInto("content_reports")
    .values({
      account_id: input.accountId,
      content_kind: input.contentKind,
      reason: input.reason,
      details: input.details,
      kid_id: input.kidId,
      game_id: input.gameId,
      client_platform: input.clientPlatform,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * The operator's view of a reported game: its public title when the game is
 * plaintext (system or Discover), never a private (sealed) game's fields.
 */
export async function reportedGameTitle(db: Db, gameId: string): Promise<string | null> {
  const game = await db
    .selectFrom("games")
    .select(["title", "is_system", "publication_requested_at"])
    .where("id", "=", gameId)
    .executeTakeFirst();
  if (!game) return null;
  const isPlaintext = game.is_system || game.publication_requested_at !== null;
  return isPlaintext ? game.title : null;
}
