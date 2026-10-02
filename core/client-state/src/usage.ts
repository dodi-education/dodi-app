/**
 * The parent's AI usage page (/parent/usage): games made and voice minutes,
 * per model and per kid, from `GET /api/usage`.
 */
import type { PlatformApi } from "./platform";

export interface UsageModelLine {
  provider: string;
  model: string;
  creates: number;
  edits: number;
  plans: number;
  analyses: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface UsageKidLine {
  kidId: string | null;
  games: number;
  voiceSeconds: number;
}

export interface UsageResponse {
  perModel: UsageModelLine[];
  perKid: UsageKidLine[];
  gamesByModel: Record<string, number>;
  voiceSeconds: number;
}

/** The usage report; null when it can't be loaded (the page shows its empty state). */
export async function loadUsage(api: PlatformApi): Promise<UsageResponse | null> {
  try {
    const res = await api.request("/api/usage");
    if (!res.ok) return null;
    return (await res.json()) as UsageResponse;
  } catch {
    return null;
  }
}

/** "claude-opus-4-8" → "Claude opus-4-8"; strips dated snapshot suffixes. */
export function prettyModel(model: string): string {
  const base = model.replace(/-\d{8}$/, "");
  if (base.startsWith("claude-")) return `Claude ${base.slice(7)}`;
  if (base.startsWith("gemini-")) return `Gemini ${base.slice(7)}`;
  if (base.startsWith("mistral-")) return `Mistral ${base.slice(8)}`;
  return base;
}

/** The stat strip's totals and whether there is anything to list. */
export function usageSummary(data: UsageResponse | null): {
  gamesMade: number;
  voiceMinutes: number;
  hasUsage: boolean;
} {
  return {
    gamesMade: (data?.perModel ?? []).reduce((s, m) => s + m.creates + m.edits, 0),
    voiceMinutes: Math.round((data?.voiceSeconds ?? 0) / 60),
    hasUsage: !!data && (data.perModel.length > 0 || data.voiceSeconds > 0),
  };
}

/** Seconds as whole minutes (the per-kid voice line). */
export function minutesOf(seconds: number): number {
  return Math.round(seconds / 60);
}
