/**
 * dodi Discover reads — the public catalog of published games.
 *
 * Published rows belong to their publisher's account and RLS deliberately
 * stays closed for everyone else, so every read here goes through the
 * service-role client with an EXPLICIT column projection. The projection IS
 * the privacy boundary: the publisher's `account_id`, `kid_id`,
 * `published_by_account_id` and `agent_transcript_enc` never leave this
 * module — the only author field a response may carry is the public
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
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Game, Json } from "@dodi/types/database";
import type {
  DiscoverGameDetail,
  DiscoverGameSummary,
} from "@dodi/types/games";
import type { ProgressKind } from "@dodi/types/success";

type Client = SupabaseClient<Database>;

/** Byline embed through the authorship FK — publication_handle only. */
const BYLINE_EMBED =
  "author:accounts!games_published_by_account_id_fkey(publication_handle)";

const SUMMARY_COLUMNS = `id, is_system, title, description, tags, target_age_min, target_age_max, estimated_duration_minutes, progress_kind, preview_image, published_at, ${BYLINE_EMBED}`;

const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, code_bundle, markdown, learning_goal, success_definition, success_criteria, metadata`;

/** Columns fetched when a published row must round-trip as a playable Game. */
const PUBLIC_GAME_COLUMNS =
  "id, is_system, title, description, target_age_min, target_age_max, estimated_duration_minutes, tags, code_bundle, markdown, learning_goal, success_definition, success_criteria, progress_kind, metadata, is_active, created_by, preview_image, publication_requested_at, published_at, approved_by, created_at, updated_at";

interface BylineRow {
  author: { publication_handle: string | null } | null;
}

export const DISCOVER_DEFAULT_PAGE_SIZE = 24;
export const DISCOVER_MAX_PAGE_SIZE = 50;

/**
 * Summary DTO minus the fields the route attaches per request: the caller's own
 * `sharing` state and the cross-family `plays`/`copies` counts (see getGameStats).
 */
export type DiscoverGameSummaryRow = Omit<
  DiscoverGameSummary,
  "sharing" | "plays" | "copies"
>;

function toSummary(row: Record<string, unknown> & BylineRow): DiscoverGameSummaryRow {
  return {
    id: row.id as string,
    is_system: row.is_system as boolean,
    title: row.title as string,
    description: row.description as string,
    tags: row.tags as string[],
    target_age_min: row.target_age_min as number,
    target_age_max: row.target_age_max as number,
    estimated_duration_minutes: row.estimated_duration_minutes as number,
    progress_kind: row.progress_kind as ProgressKind,
    preview_image: row.preview_image as string | null,
    published_at: row.published_at as string,
    publication_handle: row.author?.publication_handle ?? null,
  };
}

/**
 * The catalog page, newest first. Keyset pagination: pass the previous page's
 * last `published_at` as `cursor` to continue (backed by games_published_idx).
 */
export async function listPublishedGames(
  service: Client,
  options: { cursor?: string; limit?: number } = {},
): Promise<DiscoverGameSummaryRow[]> {
  const limit = Math.min(
    options.limit ?? DISCOVER_DEFAULT_PAGE_SIZE,
    DISCOVER_MAX_PAGE_SIZE,
  );
  let query = service
    .from("games")
    .select(SUMMARY_COLUMNS)
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (options.cursor) {
    query = query.lt("published_at", options.cursor);
  }
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown as (Record<string, unknown> & BylineRow)[]).map(
    toSummary,
  );
}

/** Aggregate play & copy counts for one published game. */
export interface GameStats {
  plays: number;
  copies: number;
}

/**
 * Play & copy counts for a set of published games, in one round trip. Plays
 * aggregate on the single published row (play-in-place); copies are the private
 * remixes that point back at it via source_game_id. The RPC reads across every
 * family's rows, so it runs on the service-role client only. Ids with no plays
 * or copies come back as zeros; ids absent from the map default to zero.
 */
export async function getGameStats(
  service: Client,
  gameIds: string[],
): Promise<Map<string, GameStats>> {
  const stats = new Map<string, GameStats>();
  if (gameIds.length === 0) return stats;
  const { data, error } = await service.rpc("discover_game_stats", {
    p_game_ids: gameIds,
  });
  if (error) throw error;
  for (const row of data ?? []) {
    // count(*) is bigint; PostgREST returns it as a JSON number, but coerce
    // defensively in case a driver hands it back as a string.
    stats.set(row.game_id, {
      plays: Number(row.plays),
      copies: Number(row.copies),
    });
  }
  return stats;
}

/** Full plaintext content of one LIVE published game — the copy (remix) source. */
export async function getPublishedGameDetail(
  service: Client,
  gameId: string,
): Promise<DiscoverGameDetail | null> {
  const { data, error } = await service
    .from("games")
    .select(DETAIL_COLUMNS)
    .eq("id", gameId)
    .not("published_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as unknown as Record<string, unknown> & BylineRow;
  return {
    ...toSummary(row),
    code_bundle: row.code_bundle as string,
    markdown: row.markdown as string,
    learning_goal: row.learning_goal as string,
    success_definition: row.success_definition as string,
    success_criteria: row.success_criteria as Json,
    metadata: row.metadata as Json,
  };
}

/**
 * Re-shape a projected published row as a full `Game` for the play paths.
 * Owner fields are nulled — this is the only Game shape a non-owner family
 * ever receives. `publication_requested_at` stays set, so the client's
 * `isEncryptableGame` predicate correctly treats the row as plaintext.
 */
function toPublicGame(row: Record<string, unknown>): Game {
  return {
    ...(row as unknown as Game),
    account_id: null,
    kid_id: null,
    published_by_account_id: null,
    agent_transcript_enc: null,
    current_game_version_id: null,
    source_game_id: null,
    system_key: null,
    rejected_at: null,
    rejection_kind: null,
    rejection_reasons: null,
    review_attempts: 0,
  };
}

/** One LIVE published row as a playable, sanitized `Game`, or null. */
export async function getPublishedGame(
  service: Client,
  gameId: string,
): Promise<Game | null> {
  const { data, error } = await service
    .from("games")
    .select(PUBLIC_GAME_COLUMNS)
    .eq("id", gameId)
    .not("published_at", "is", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toPublicGame(data as unknown as Record<string, unknown>) : null;
}

/**
 * LIVE published rows by id, sanitized (the kid-library merge). Ids that are
 * not published games — e.g. stale sharing rows after an unpublish that raced
 * the CASCADE — are silently absent from the result.
 */
export async function getPublishedGamesByIds(
  service: Client,
  gameIds: string[],
): Promise<Game[]> {
  if (gameIds.length === 0) return [];
  const { data, error } = await service
    .from("games")
    .select(PUBLIC_GAME_COLUMNS)
    .in("id", gameIds)
    .not("published_at", "is", null);
  if (error) throw error;
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(
    toPublicGame,
  );
}
