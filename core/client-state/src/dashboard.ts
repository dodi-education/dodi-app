/**
 * The parent dashboard's data: the activity stats, whether the family still
 * needs an AI provider (the setup nudge), and the "kids at a glance" rows.
 * Kid names arrive decrypted from the kid store; nothing here reads plaintext
 * from the server.
 */
import type { AccountModelConfig } from "@dodi/types/ai";
import type { Kid } from "@dodi/types/database";
import type { VaultProviders } from "@dodi/vault";

import type { PlatformApi } from "./platform";

export interface DashboardStats {
  sessionsToday: number;
  sessionsThisWeek: number;
  gamesCreated: number;
}

/** Shown until (or instead of, on failure) the stats load. */
export const EMPTY_DASHBOARD_STATS: DashboardStats = {
  sessionsToday: 0,
  sessionsThisWeek: 0,
  gamesCreated: 0,
};

/** GET /api/dashboard; null when it fails (keep showing the zeros). */
export async function loadDashboardStats(
  api: Pick<PlatformApi, "request">,
): Promise<DashboardStats | null> {
  try {
    const res = await api.request("/api/dashboard");
    if (!res.ok) return null;
    return (await res.json()) as DashboardStats;
  } catch {
    return null;
  }
}

/** GET /api/ai/config; null when none is saved yet or the fetch fails. */
export async function loadModelConfig(
  api: Pick<PlatformApi, "request">,
): Promise<AccountModelConfig | null> {
  try {
    const res = await api.request("/api/ai/config");
    if (!res.ok) return null;
    return (await res.json()) as AccountModelConfig | null;
  } catch {
    return null;
  }
}

/**
 * Whether to show the "connect an AI provider" nudge: until the family has an
 * own key in the vault or a category running on dodi AI, nothing that needs a
 * model works. Null while either source is still loading (`config`
 * undefined), so a configured account never sees the nudge flash.
 */
export function needsAiSetup(
  providers: VaultProviders | null,
  config: AccountModelConfig | null | undefined,
): boolean | null {
  if (providers === null || config === undefined) return null;
  const hasOwnKey = Object.keys(providers).length > 0;
  const usesDodiAI =
    config !== null &&
    [
      config.voiceProvider,
      config.thinkingProvider,
      config.gameProvider,
      config.imageProvider,
    ].includes("dodi");
  return !hasOwnKey && !usesDodiAI;
}

/** One "kids at a glance" row, ready to render. */
export interface KidGlanceItem {
  id: string;
  name: string;
  /** The avatar circle's letter. */
  initial: string;
  birthdate: string | null;
  /** The kid's language code, upper-cased ("DE"). */
  languageLabel: string;
  /** The active persona (embedded in the kid row), or null. */
  personaName: string | null;
  /** Position in the list: picks the avatar color from the client's palette. */
  colorIndex: number;
}

export function kidGlanceItems(kids: readonly Kid[]): KidGlanceItem[] {
  return kids.map((kid, index) => ({
    id: kid.id,
    name: kid.display_name,
    initial: kid.display_name[0]?.toUpperCase() ?? "",
    birthdate: kid.birthdate,
    languageLabel: kid.language.toUpperCase(),
    personaName: kid.active_persona?.name ?? null,
    colorIndex: index,
  }));
}
