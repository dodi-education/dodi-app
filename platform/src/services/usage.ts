/**
 * AI usage ledger — append-only persistence + monthly aggregation. Mirrors the
 * game-plays service shape. Cost is NOT tracked (BYOK: the provider's own
 * dashboards are the source of truth for money) — this records usage only.
 * Per-call context sizes land in typed `meta_*` columns. `aggregateMonthly` is
 * pure so it's unit-testable without supabase.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, AiUsageLog, AiUsageLogInsert } from "@dodi/types/database";
import type { TokenUsage, UsageEventType, UsageMeta } from "@dodi/types/usage";

type Client = SupabaseClient<Database>;

export interface RecordUsageInput {
  accountId: string;
  kidId?: string | null;
  gameId?: string | null;
  eventType: UsageEventType;
  provider: string;
  model: string;
  usage?: TokenUsage;
  voiceSeconds?: number;
  meta?: UsageMeta;
}

export async function recordUsage(
  supabase: Client,
  input: RecordUsageInput,
): Promise<AiUsageLog> {
  const m = input.meta ?? {};

  const payload: AiUsageLogInsert = {
    account_id: input.accountId,
    kid_id: input.kidId ?? null,
    game_id: input.gameId ?? null,
    event_type: input.eventType,
    provider: input.provider,
    model: input.model,
    input_tokens: input.usage?.inputTokens ?? null,
    output_tokens: input.usage?.outputTokens ?? null,
    cache_write_tokens: input.usage?.cacheWriteTokens ?? null,
    cache_read_tokens: input.usage?.cacheReadTokens ?? null,
    voice_seconds: input.voiceSeconds ?? null,
    meta_turns: m.turns ?? null,
    meta_validation_retries: m.validationRetries ?? null,
    meta_output_chars: m.outputChars ?? null,
    meta_memory_chars: m.memoryChars ?? null,
    meta_parent_notes_chars: m.parentNotesChars ?? null,
    meta_learning_goal_chars: m.learningGoalChars ?? null,
    meta_success_def_chars: m.successDefChars ?? null,
    meta_prompt_chars: m.promptChars ?? null,
    meta_tags_chars: m.tagsChars ?? null,
    meta_persona_chars: m.personaChars ?? null,
  };

  const { data, error } = await supabase
    .from("ai_usage_logs")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return data as unknown as AiUsageLog;
}

/** The subset of an ai_usage_logs row `aggregateMonthly` needs. */
export interface UsageRow {
  event_type: string;
  provider: string;
  model: string;
  kid_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_write_tokens: number | null;
  cache_read_tokens: number | null;
  voice_seconds: number | null;
}

export interface ModelUsageLine {
  provider: string;
  model: string;
  creates: number;
  edits: number;
  analyses: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface KidUsageLine {
  kidId: string | null;
  games: number;
  voiceSeconds: number;
}

export interface MonthlyUsage {
  perModel: ModelUsageLine[];
  /** game_create + game_edit counts keyed by model. */
  gamesByModel: Record<string, number>;
  voiceSeconds: number;
  perKid: KidUsageLine[];
}

const isGame = (t: string): boolean => t === "game_create" || t === "game_edit";
const eventTotal = (m: ModelUsageLine): number => m.creates + m.edits + m.analyses;

/** Pure aggregation over a month's rows (usage only). */
export function aggregateMonthly(rows: UsageRow[]): MonthlyUsage {
  const models = new Map<string, ModelUsageLine>();
  const kids = new Map<string, KidUsageLine>();
  const gamesByModel: Record<string, number> = {};
  let voiceSeconds = 0;

  for (const r of rows) {
    const mk = `${r.provider}:${r.model}`;
    let m = models.get(mk);
    if (!m) {
      m = {
        provider: r.provider,
        model: r.model,
        creates: 0,
        edits: 0,
        analyses: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
      };
      models.set(mk, m);
    }
    m.inputTokens += r.input_tokens ?? 0;
    m.outputTokens += r.output_tokens ?? 0;
    m.cacheReadTokens += r.cache_read_tokens ?? 0;
    if (r.event_type === "game_create") m.creates += 1;
    else if (r.event_type === "game_edit") m.edits += 1;
    else if (r.event_type === "game_analysis") m.analyses += 1;

    if (isGame(r.event_type)) {
      gamesByModel[r.model] = (gamesByModel[r.model] ?? 0) + 1;
    }
    if (r.event_type === "voice_minutes") voiceSeconds += r.voice_seconds ?? 0;

    const kk = r.kid_id ?? "__account__";
    let k = kids.get(kk);
    if (!k) {
      k = { kidId: r.kid_id, games: 0, voiceSeconds: 0 };
      kids.set(kk, k);
    }
    if (isGame(r.event_type)) k.games += 1;
    if (r.event_type === "voice_minutes") k.voiceSeconds += r.voice_seconds ?? 0;
  }

  return {
    perModel: [...models.values()].sort((a, b) => eventTotal(b) - eventTotal(a)),
    gamesByModel,
    voiceSeconds,
    perKid: [...kids.values()].sort((a, b) => b.games - a.games),
  };
}

/** First instant of the UTC calendar month containing `d`. */
export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addUtcMonth(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}

export async function getMonthlyUsage(
  supabase: Client,
  accountId: string,
  monthStart: Date,
): Promise<MonthlyUsage> {
  const start = startOfUtcMonth(monthStart);
  const end = addUtcMonth(start, 1);
  const { data, error } = await supabase
    .from("ai_usage_logs")
    .select(
      "event_type,provider,model,kid_id,input_tokens,output_tokens,cache_write_tokens,cache_read_tokens,voice_seconds",
    )
    .eq("account_id", accountId)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) throw error;
  return aggregateMonthly((data ?? []) as UsageRow[]);
}
