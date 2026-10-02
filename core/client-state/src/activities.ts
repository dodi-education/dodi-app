/**
 * The parent's activity feed (/parent/activities): kid activity rows, filtered
 * by kid, persona and event, paged. Game titles are E2EE, so a row references
 * its game by id and the title is resolved from the DECRYPTED game cache; it
 * is never written into the plaintext `message`.
 */
import type { Activity } from "@dodi/types/database";
import type { VaultSession } from "@dodi/vault";

import type { PlatformApi } from "./platform";
import { loadPersonas } from "./personas";

/** Non-memory kid activity kinds only (memory lives on the kid memory page). */
export const ACTIVITY_EVENT_TYPES = [
  "session_start",
  "game_started",
  "game_command_executed",
  "game_command_failed",
  "snapshot_created",
  "snapshot_shared",
  "friend_request_sent",
  "friend_request_accepted",
] as const;

export type ActivityEventType = (typeof ACTIVITY_EVENT_TYPES)[number];

/** The `activities` message key of each event's label. */
const EVENT_LABEL_KEYS: Record<ActivityEventType, string> = {
  session_start: "sessionStart",
  game_started: "gameStarted",
  game_command_executed: "gameCommandExecuted",
  game_command_failed: "gameCommandFailed",
  snapshot_created: "snapshotCreated",
  snapshot_shared: "snapshotShared",
  friend_request_sent: "friendRequestSent",
  friend_request_accepted: "friendRequestAccepted",
};

/** An event's label: its `activities` message, or the raw event name. */
export function activityEventLabel(event: string, t: (key: string) => string): string {
  const key = EVENT_LABEL_KEYS[event as ActivityEventType];
  return key ? t(key) : event;
}

/** The badge variant of an event (blue for sessions/starts, red for failures). */
export function activityBadgeVariant(event: string): "blue" | "destructive" | "gray" {
  if (event === "session_start" || event === "game_started") return "blue";
  if (event === "game_command_failed") return "destructive";
  return "gray";
}

export const ACTIVITIES_PAGE_SIZE = 50;

/** "all" means unfiltered. */
export interface ActivityFilters {
  kidId: string;
  personaId: string;
  event: string;
}

export const NO_ACTIVITY_FILTERS: ActivityFilters = { kidId: "all", personaId: "all", event: "all" };

export function isUnfiltered(filters: ActivityFilters): boolean {
  return filters.kidId === "all" && filters.personaId === "all" && filters.event === "all";
}

/** `/api/activities?…` for one page. */
export function activitiesPath(filters: ActivityFilters, offset: number): string {
  const params = new URLSearchParams();
  if (filters.kidId !== "all") params.set("kidId", filters.kidId);
  if (filters.personaId !== "all") params.set("personaId", filters.personaId);
  if (filters.event !== "all") params.set("event", filters.event);
  params.set("limit", String(ACTIVITIES_PAGE_SIZE));
  params.set("offset", String(offset));
  return `/api/activities?${params.toString()}`;
}

/** One page of activity rows; `hasMore` when the page came back full. */
export async function loadActivities(
  api: PlatformApi,
  filters: ActivityFilters,
  offset: number,
): Promise<{ rows: Activity[]; hasMore: boolean }> {
  const res = await api.request(activitiesPath(filters, offset));
  if (!res.ok) throw new Error("Failed to fetch");
  const rows = (await res.json()) as Activity[];
  return { rows, hasMore: rows.length === ACTIVITIES_PAGE_SIZE };
}

/** The persona filter's options (account persona names decrypted). */
export async function loadPersonaOptions(
  api: PlatformApi,
  session: VaultSession,
): Promise<{ id: string; name: string }[]> {
  const personas = await loadPersonas(api, session);
  return personas.map((p) => ({ id: p.id, name: p.name }));
}

/** A row's title: "[Game title] message" when its game is in the decrypted cache. */
export function activityTitle(
  row: Pick<Activity, "game_id" | "message">,
  gameTitles: Map<string, string>,
): string {
  const title = row.game_id ? gameTitles.get(row.game_id) : undefined;
  return title ? `[${title}] ${row.message}` : row.message;
}
