/**
 * Game plays — persistence of gameplay outcomes.
 *
 * Each time a child plays a game we record a `game_plays` row capturing the
 * final progress, the standardized metrics, and whether the success goal was
 * met. This is the operational substrate the (future) challenge engine reasons
 * over — e.g. "Solve 3 math games today" via {@link countSucceededPlays}.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, GamePlay, GamePlayInsert, Json } from "@dodi/types/database";
import type { MetricsSummary, ProgressKind } from "@dodi/types/success";

type Client = SupabaseClient<Database>;

function castPlay(row: unknown): GamePlay {
  return row as GamePlay;
}

export interface StartPlayInput {
  accountId: string;
  profileId: string;
  gameId: string;
  progressKind: ProgressKind;
}

export async function startPlay(
  supabase: Client,
  input: StartPlayInput,
): Promise<GamePlay> {
  const payload: GamePlayInsert = {
    account_id: input.accountId,
    profile_id: input.profileId,
    game_id: input.gameId,
    progress_kind: input.progressKind,
  };

  const { data, error } = await supabase
    .from("game_plays")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return castPlay(data);
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
}

export async function updatePlay(
  supabase: Client,
  playId: string,
  input: UpdatePlayInput,
): Promise<GamePlay> {
  const now = input.at ?? new Date().toISOString();
  const updates: Database["public"]["Tables"]["game_plays"]["Update"] = {};

  if (typeof input.finalProgress === "number") {
    updates.final_progress = Math.max(0, Math.min(1, input.finalProgress));
  }
  if (input.metrics) {
    updates.metrics = input.metrics as unknown as Json;
  }
  if (input.succeeded) {
    updates.succeeded = true;
    updates.succeeded_at = now;
  }
  if (input.ended) {
    updates.ended_at = now;
  }

  const { data, error } = await supabase
    .from("game_plays")
    .update(updates)
    .eq("id", playId)
    .select("*")
    .single();

  if (error) throw error;
  return castPlay(data);
}

export interface CountSucceededPlaysInput {
  profileId: string;
  /** Restrict to games carrying this tag, e.g. "math" for "Solve 3 math games". */
  tag?: string;
  /** Only count plays started within the last N days. */
  sinceDays?: number;
}

/**
 * Count succeeded plays for a profile — the query that powers challenges like
 * "Solve 3 math games today". Subject was dropped from game_plays, so a tag
 * filter joins through to the game's `tags` array instead.
 */
export async function countSucceededPlays(
  supabase: Client,
  input: CountSucceededPlaysInput,
): Promise<number> {
  const cutoff =
    typeof input.sinceDays === "number"
      ? new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  if (input.tag) {
    let query = supabase
      .from("game_plays")
      .select("id, games!inner(tags)", { count: "exact", head: true })
      .eq("profile_id", input.profileId)
      .eq("succeeded", true)
      .contains("games.tags", [input.tag]);
    if (cutoff) query = query.gte("started_at", cutoff);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
  }

  let query = supabase
    .from("game_plays")
    .select("id", { count: "exact", head: true })
    .eq("profile_id", input.profileId)
    .eq("succeeded", true);
  if (cutoff) query = query.gte("started_at", cutoff);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function getPlay(
  supabase: Client,
  playId: string,
): Promise<GamePlay | null> {
  const { data, error } = await supabase
    .from("game_plays")
    .select("*")
    .eq("id", playId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return castPlay(data);
}
