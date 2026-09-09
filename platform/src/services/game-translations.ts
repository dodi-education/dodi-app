import type { Game, GameTranslation } from "@dodi/types/database";

import type { Db } from "@/lib/db";

/**
 * Per-locale title/description overrides for PLAINTEXT games: the seeded
 * system games, and parent PUBLICATION copies (written at submit from the
 * publish flow's translations, extended by the locale backfill). Private
 * games' title/description are E2EE and never get rows: `applyTranslation`
 * is a no-op for them. The boundary every writer must keep: a translation row
 * is plaintext, so it may only ever exist for a game whose own fields are
 * plaintext too (system or published).
 */

/**
 * Replace a game's translation rows with exactly `entries`, the
 * resubmit-safe write the publish gate uses. Delete-then-insert on purpose:
 * stale locales vanish with the delete, and the write runs on the service
 * handle with a single writer per game, so the tiny non-atomic window is
 * harmless.
 */
export async function upsertTranslations(
  db: Db,
  gameId: string,
  entries: Array<{ locale: string; title: string; description: string }>,
): Promise<void> {
  await db.deleteFrom("game_translations").where("game_id", "=", gameId).execute();

  if (entries.length === 0) return;
  await db
    .insertInto("game_translations")
    .values(
      entries.map((entry) => ({
        game_id: gameId,
        locale: entry.locale,
        title: entry.title,
        description: entry.description,
      })),
    )
    .execute();
}

export async function getTranslation(
  db: Db,
  gameId: string,
  locale: string,
): Promise<GameTranslation | null> {
  const row = await db
    .selectFrom("game_translations")
    .selectAll()
    .where("game_id", "=", gameId)
    .where("locale", "=", locale)
    .executeTakeFirst();
  return row ?? null;
}

/** All locales' rows for one game (review prompt, backfill bookkeeping). */
export async function listTranslations(
  db: Db,
  gameId: string,
): Promise<GameTranslation[]> {
  return await db
    .selectFrom("game_translations")
    .selectAll()
    .where("game_id", "=", gameId)
    .orderBy("locale", "asc")
    .execute();
}

export async function getTranslationsForGames(
  db: Db,
  gameIds: string[],
  locale: string,
): Promise<Map<string, GameTranslation>> {
  if (gameIds.length === 0) return new Map();

  const rows = await db
    .selectFrom("game_translations")
    .selectAll()
    .where("game_id", "in", gameIds)
    .where("locale", "=", locale)
    .execute();

  const map = new Map<string, GameTranslation>();
  for (const row of rows) {
    map.set(row.game_id, row);
  }
  return map;
}

export function applyTranslation<
  T extends Pick<Game, "title" | "description">,
>(game: T, translation?: GameTranslation | null): T {
  if (!translation) return game;
  return {
    ...game,
    title: translation.title,
    description: translation.description || game.description,
  };
}
