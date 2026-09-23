/**
 * dodi Discover reads: the public catalog of published games.
 *
 * Published rows belong to their publisher's account and RLS deliberately
 * stays closed for everyone else, so every read here goes through the
 * BYPASSRLS service handle with an EXPLICIT column projection. The projection
 * IS the privacy boundary: the publisher's `account_id`, `kid_id`,
 * `published_by_account_id` and `agent_transcript_enc` never leave this
 * module. The only author field a response may carry is the public
 * `publication_handle` byline (embedded via the authorship FK).
 *
 * Discover is play-in-place: a family shares a published row with its kids via
 * game_sharings (see services/games), so plays aggregate on the single
 * published row. Copying happens only through Remix, which re-seals the
 * plaintext detail under the remixing family's own vault.
 *
 * The system games are dodi's own published rows (is_system = true,
 * approved_by = 'system') and flow through here like any other publication;
 * they have no author account, so their byline is null and the client renders
 * "dodi" instead.
 */
import { sql, type ExpressionBuilder } from "kysely";
import { jsonObjectFrom } from "kysely/helpers/postgres";

import type { Database, Game, Json } from "@dodi/types/database";
import type {
  DiscoverGameDetail,
  PublicGameSummary,
  PublicCatalogGame,
} from "@dodi/types/games";
import type { ProgressKind } from "@dodi/types/success";

import type { Db } from "@/lib/db";

/** Byline embed through the authorship FK: publication_handle only. */
function byline(eb: ExpressionBuilder<Database, "games">) {
  return jsonObjectFrom(
    eb
      .selectFrom("accounts")
      .select("accounts.publication_handle")
      .whereRef("accounts.id", "=", "games.published_by_account_id"),
  ).as("author");
}

/**
 * The projections. These arrays are the privacy boundary: they are the only
 * columns a Discover read ever fetches, so they stay explicit (never a
 * selectAll) and every query below selects exactly one of them.
 */
const SUMMARY_COLUMNS = [
  "id",
  "is_system",
  "title",
  "description",
  "tags",
  "target_age_min",
  "target_age_max",
  "estimated_duration_minutes",
  "progress_kind",
  "preview_image",
  "published_at",
  "available_locales",
] as const;

const DETAIL_COLUMNS = [
  ...SUMMARY_COLUMNS,
  "code_bundle",
  "markdown",
  "learning_goal",
  "success_definition",
  "success_criteria",
  "metadata",
] as const;

/** Columns fetched when a published row must round-trip as a playable Game. */
const PUBLIC_GAME_COLUMNS = [
  "id",
  "is_system",
  "title",
  "description",
  "target_age_min",
  "target_age_max",
  "estimated_duration_minutes",
  "tags",
  "code_bundle",
  "markdown",
  "learning_goal",
  "success_definition",
  "success_criteria",
  "progress_kind",
  "metadata",
  "is_active",
  "created_by",
  "preview_image",
  "publication_requested_at",
  "published_at",
  "approved_by",
  "available_locales",
  "created_at",
  "updated_at",
] as const;

interface BylineRow {
  author: { publication_handle: string | null } | null;
}

type SummaryRow = Pick<Game, (typeof SUMMARY_COLUMNS)[number]> & BylineRow;
type DetailRow = Pick<Game, (typeof DETAIL_COLUMNS)[number]> & BylineRow;
type PublicGameRow = Pick<Game, (typeof PUBLIC_GAME_COLUMNS)[number]>;

export const DISCOVER_DEFAULT_PAGE_SIZE = 24;
export const DISCOVER_MAX_PAGE_SIZE = 50;

/**
 * Summary DTO minus the fields the route attaches per request: the caller's own
 * `sharing` state and the cross-family `plays`/`copies` counts (see getGameStats).
 * Identical to the anonymous public projection, so the public routes serve it as-is.
 */
export type DiscoverGameSummaryRow = PublicGameSummary;

function toSummary(row: SummaryRow): DiscoverGameSummaryRow {
  return {
    id: row.id,
    is_system: row.is_system,
    title: row.title,
    description: row.description,
    tags: row.tags,
    target_age_min: row.target_age_min,
    target_age_max: row.target_age_max,
    estimated_duration_minutes: row.estimated_duration_minutes,
    progress_kind: row.progress_kind as ProgressKind,
    preview_image: row.preview_image,
    // Every query here filters on published_at IS NOT NULL.
    published_at: row.published_at as string,
    publication_handle: row.author?.publication_handle ?? null,
    available_locales: row.available_locales ?? null,
  };
}

/**
 * The catalog page, newest first. Keyset pagination: pass the previous page's
 * last `published_at` as `cursor` to continue (backed by games_published_idx).
 */
export async function listPublishedGames(
  service: Db,
  options: { cursor?: string; limit?: number } = {},
): Promise<DiscoverGameSummaryRow[]> {
  const limit = Math.min(
    options.limit ?? DISCOVER_DEFAULT_PAGE_SIZE,
    DISCOVER_MAX_PAGE_SIZE,
  );
  let query = service
    .selectFrom("games")
    .select(SUMMARY_COLUMNS)
    .select(byline)
    .where("published_at", "is not", null)
    .orderBy("published_at", "desc")
    .limit(limit);
  if (options.cursor) {
    query = query.where("published_at", "<", options.cursor);
  }
  const rows = await query.execute();
  return rows.map(toSummary);
}

/**
 * Id-pool cap for random sampling. The catalog is tiny today (system games +
 * approved publications); if it ever outgrows this, swap the in-process sample
 * for an ORDER BY random() query instead of raising the cap.
 */
const RANDOM_ID_POOL_LIMIT = 1000;

/**
 * Up to `limit` RANDOM published games, the logged-out game page's "popular
 * games" rail. Samples in process: fetch the published ids, partial
 * Fisher-Yates with the injectable `rng`, then one summary fetch by id.
 */
export async function listRandomPublishedGameSummaries(
  service: Db,
  limit: number,
  rng: () => number = Math.random,
): Promise<DiscoverGameSummaryRow[]> {
  const idRows = await service
    .selectFrom("games")
    .select("id")
    .where("published_at", "is not", null)
    .limit(RANDOM_ID_POOL_LIMIT)
    .execute();
  const ids = idRows.map((row) => row.id);

  // Partial Fisher-Yates: after i steps the first i slots are the sample.
  const count = Math.min(Math.max(limit, 0), ids.length);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const sampled = ids.slice(0, count);
  if (sampled.length === 0) return [];

  const rows = await service
    .selectFrom("games")
    .select(SUMMARY_COLUMNS)
    .select(byline)
    .where("id", "in", sampled)
    .execute();
  const byId = new Map(rows.map((row) => [row.id, toSummary(row)] as const));
  return sampled.flatMap((id) => byId.get(id) ?? []);
}

/**
 * Catalog cap, well above any near-term catalog size. Summaries carry the
 * preview image (a ~100×100 JPEG data URL for parent publications, roughly
 * 10 KB each), so the feed needs pagination long before it reaches this.
 */
const CATALOG_LIMIT = 5000;

/**
 * The whole LIVE catalog as summaries plus `updated_at`, newest first (id
 * breaks ties so the order is stable). One feed for every consumer: the web
 * client's sitemap and the marketing site's statically built games page.
 */
export async function listPublishedGameCatalog(
  service: Db,
): Promise<PublicCatalogGame[]> {
  const rows = await service
    .selectFrom("games")
    .select(SUMMARY_COLUMNS)
    .select("updated_at")
    .select(byline)
    .where("published_at", "is not", null)
    .orderBy("published_at", "desc")
    .orderBy("id", "asc")
    .limit(CATALOG_LIMIT)
    .execute();
  return rows.map((row) => ({ ...toSummary(row), updated_at: row.updated_at }));
}

/** Aggregate play & copy counts for one published game. */
export interface GameStats {
  plays: number;
  copies: number;
}

/**
 * Play & copy counts for a set of published games, in one round trip. Plays
 * aggregate on the single published row (play-in-place); copies are the private
 * remixes that point back at it via source_game_id. The SQL function reads
 * across every family's rows, so it runs on the service handle only. Ids with
 * no plays or copies come back as zeros; ids absent from the map default to zero.
 */
export async function getGameStats(
  service: Db,
  gameIds: string[],
): Promise<Map<string, GameStats>> {
  const stats = new Map<string, GameStats>();
  if (gameIds.length === 0) return stats;
  const { rows } = await sql<{
    game_id: string;
    plays: number;
    copies: number;
  }>`select * from public.discover_game_stats(${sql.val(gameIds)}::uuid[])`.execute(
    service,
  );
  for (const row of rows) {
    // count(*) is bigint; the pg type parser hands it back as a number, but
    // coerce defensively in case a driver returns a string or BigInt.
    stats.set(row.game_id, {
      plays: Number(row.plays),
      copies: Number(row.copies),
    });
  }
  return stats;
}

/** Full plaintext content of one LIVE published game: the copy (remix) source. */
export async function getPublishedGameDetail(
  service: Db,
  gameId: string,
): Promise<DiscoverGameDetail | null> {
  const row: DetailRow | undefined = await service
    .selectFrom("games")
    .select(DETAIL_COLUMNS)
    .select(byline)
    .where("id", "=", gameId)
    .where("published_at", "is not", null)
    .executeTakeFirst();
  if (!row) return null;
  return {
    ...toSummary(row),
    code_bundle: row.code_bundle,
    markdown: row.markdown,
    learning_goal: row.learning_goal,
    success_definition: row.success_definition,
    success_criteria: row.success_criteria as Json,
    metadata: row.metadata as Json,
  };
}

/**
 * Re-shape a projected published row as a full `Game` for the play paths.
 * Owner fields are nulled: this is the only Game shape a non-owner family
 * ever receives. `publication_requested_at` stays set, so the client's
 * `isEncryptableGame` predicate correctly treats the row as plaintext.
 */
function toPublicGame(row: PublicGameRow): Game {
  return {
    ...row,
    account_id: null,
    kid_id: null,
    published_by_account_id: null,
    agent_transcript_enc: null,
    plan_enc: null,
    current_game_version_id: null,
    source_game_id: null,
    source_game_version_id: null,
    system_key: null,
    rejected_at: null,
    rejection_kind: null,
    rejection_reasons: null,
    review_attempts: 0,
  };
}

/** One LIVE published row as a playable, sanitized `Game`, or null. */
export async function getPublishedGame(
  service: Db,
  gameId: string,
): Promise<Game | null> {
  const row = await service
    .selectFrom("games")
    .select(PUBLIC_GAME_COLUMNS)
    .where("id", "=", gameId)
    .where("published_at", "is not", null)
    .executeTakeFirst();
  return row ? toPublicGame(row) : null;
}

/**
 * LIVE published rows by id, sanitized (the kid-library merge). Ids that are
 * not published games, e.g. stale sharing rows after an unpublish that raced
 * the CASCADE, are silently absent from the result.
 */
export async function getPublishedGamesByIds(
  service: Db,
  gameIds: string[],
): Promise<Game[]> {
  if (gameIds.length === 0) return [];
  const rows = await service
    .selectFrom("games")
    .select(PUBLIC_GAME_COLUMNS)
    .where("id", "in", gameIds)
    .where("published_at", "is not", null)
    .execute();
  return rows.map(toPublicGame);
}
