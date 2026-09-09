/**
 * Game plays: persistence of gameplay outcomes.
 *
 * Each time a child plays a game we record a `game_plays` row capturing the
 * final progress, the standardized metrics, and whether the success goal was
 * met. This is the operational substrate the (future) challenge engine reasons
 * over, e.g. "Solve 3 math games today" via {@link countSucceededPlays}.
 */
import { sql } from "kysely";

import type {
  GamePlay,
  GamePlayInsert,
  GamePlayUpdate,
  Json,
} from "@dodi/types/database";
import type { MetricsSummary, ProgressKind } from "@dodi/types/success";

import type { Db } from "@/lib/db";

export interface StartPlayInput {
  accountId: string;
  kidId: string;
  gameId: string;
  progressKind: ProgressKind;
  /** Client-generated id (offline sync); omitted = DB default. */
  playId?: string;
  /** Real start time for late-synced plays; omitted = DB default (now). */
  startedAt?: string;
}

export async function startPlay(
  db: Db,
  input: StartPlayInput,
): Promise<GamePlay> {
  const payload: GamePlayInsert = {
    account_id: input.accountId,
    kid_id: input.kidId,
    game_id: input.gameId,
    progress_kind: input.progressKind,
    ...(input.playId ? { id: input.playId } : {}),
    ...(input.startedAt ? { started_at: input.startedAt } : {}),
  };

  return await db
    .insertInto("game_plays")
    .values(payload)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export interface UpdatePlayInput {
  finalProgress?: number;
  metrics?: MetricsSummary;
  /** Pass true once, on the first transition to success. */
  succeeded?: boolean;
  /** Pass true when the play session ends (stamps ended_at). */
  ended?: boolean;
  /** Timestamp (ISO) to use for succeeded_at / ended_at. Defaults to now. */
  at?: string;
  /** Per-field overrides for late-synced (offline) plays; win over `at`. */
  succeededAt?: string;
  endedAt?: string;
}

export async function updatePlay(
  db: Db,
  playId: string,
  input: UpdatePlayInput,
): Promise<GamePlay> {
  const now = input.at ?? new Date().toISOString();
  const updates: GamePlayUpdate = {};

  if (typeof input.finalProgress === "number") {
    updates.final_progress = Math.max(0, Math.min(1, input.finalProgress));
  }
  if (input.metrics) {
    updates.metrics = input.metrics as unknown as Json;
  }
  if (input.succeeded) {
    updates.succeeded = true;
    updates.succeeded_at = input.succeededAt ?? now;
  }
  if (input.ended) {
    updates.ended_at = input.endedAt ?? now;
  }

  return await db
    .updateTable("game_plays")
    .set(updates)
    .where("id", "=", playId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export interface CountSucceededPlaysInput {
  kidId: string;
  /** Restrict to games carrying this tag, e.g. "math" for "Solve 3 math games". */
  tag?: string;
  /** Only count plays started within the last N days. */
  sinceDays?: number;
}

/**
 * Count succeeded plays for a kid: the query that powers challenges like
 * "Solve 3 math games today". Subject was dropped from game_plays, so a tag
 * filter joins through to the game's `tags` array instead.
 */
export async function countSucceededPlays(
  db: Db,
  input: CountSucceededPlaysInput,
): Promise<number> {
  const cutoff =
    typeof input.sinceDays === "number"
      ? new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  if (input.tag) {
    let query = db
      .selectFrom("game_plays")
      .innerJoin("games", "games.id", "game_plays.game_id")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("game_plays.kid_id", "=", input.kidId)
      .where("game_plays.succeeded", "=", true)
      .where("games.tags", "@>", sql<string[]>`${sql.val([input.tag])}::text[]`);
    if (cutoff) query = query.where("game_plays.started_at", ">=", cutoff);
    const { count } = await query.executeTakeFirstOrThrow();
    return Number(count ?? 0);
  }

  let query = db
    .selectFrom("game_plays")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("kid_id", "=", input.kidId)
    .where("succeeded", "=", true);
  if (cutoff) query = query.where("started_at", ">=", cutoff);
  const { count } = await query.executeTakeFirstOrThrow();
  return Number(count ?? 0);
}

export async function getPlay(
  db: Db,
  playId: string,
): Promise<GamePlay | null> {
  const row = await db
    .selectFrom("game_plays")
    .selectAll()
    .where("id", "=", playId)
    .executeTakeFirst();
  return row ?? null;
}
