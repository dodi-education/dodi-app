/**
 * Offline-capable play/event tracking (mirrors ../ai/transcript-sync).
 *
 * Play ids are CLIENT-generated UUIDs, so start-of-play is synchronous and the
 * whole record survives offline in a localStorage outbox: progress patches
 * coalesce into one entry per play, and the flush replays them as
 * POST /api/games/[gameId]/plays (idempotent — the id is the idempotency key)
 * followed by a PATCH with the final fields. Events queue alongside
 * (at-least-once; a duplicate is possible only on a crash between ack and
 * outbox write — acceptable for an activity feed).
 *
 * Synchronous outbox writes ARE the crash persistence; flushes are debounced,
 * serialized, and triggered again from the kid layout on mount and on every
 * offline→online transition. Permanent rejections (4xx — deleted game,
 * foreign id collision) drop the entry; transient failures (network, 5xx)
 * abort the flush and leave everything queued.
 */

import { dodi } from "@/lib/api";
import { useConnectivityStore } from "@/stores/connectivity-store";
import type { MetricsSummary } from "@dodi/types/success";

export interface PlayOutboxEntry {
  playId: string;
  gameId: string;
  kidId: string;
  startedAt: string;
  /** POST acked — only the PATCH (final fields) may still be pending. */
  isStartSynced: boolean;
  /** Patch fields recorded since the last acked PATCH. */
  hasUnsyncedPatch: boolean;
  /** Set on unmount — after the final PATCH acks, the entry is removed. */
  isEnded: boolean;
  succeeded?: boolean;
  succeededAt?: string;
  endedAt?: string;
  finalProgress?: number;
  metrics?: MetricsSummary;
}

export interface GameEventOutboxEntry {
  id: string;
  gameId: string;
  kidId: string;
  event: string;
  message: string;
  occurredAt: string;
}

interface OutboxFile {
  v: 1;
  plays: PlayOutboxEntry[];
  events: GameEventOutboxEntry[];
}

const OUTBOX_KEY = "dodi-play-outbox";
const FLUSH_DEBOUNCE_MS = 400;
// The outbox only grows while offline; drop oldest past these.
const MAX_PLAYS = 50;
const MAX_EVENTS = 200;

let flushTimer: ReturnType<typeof setTimeout> | null = null;
// Serialized flush chain (transcript-sync convention) — flushes never overlap.
let chain: Promise<void> = Promise.resolve();

function enqueue(op: () => Promise<void>): Promise<void> {
  const run = chain.then(op, op).catch(() => {});
  chain = run;
  return run;
}

function readOutbox(): OutboxFile {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return { v: 1, plays: [], events: [] };
    const file = JSON.parse(raw) as OutboxFile;
    if (file.v !== 1 || !Array.isArray(file.plays) || !Array.isArray(file.events)) {
      return { v: 1, plays: [], events: [] };
    }
    return file;
  } catch {
    return { v: 1, plays: [], events: [] };
  }
}

function writeOutbox(file: OutboxFile): void {
  try {
    if (file.plays.length === 0 && file.events.length === 0) {
      localStorage.removeItem(OUTBOX_KEY);
      return;
    }
    localStorage.setItem(
      OUTBOX_KEY,
      JSON.stringify({
        v: 1,
        plays: file.plays.slice(-MAX_PLAYS),
        events: file.events.slice(-MAX_EVENTS),
      } satisfies OutboxFile),
    );
  } catch {
    // Quota / unavailable — tracking degrades, gameplay never blocks.
  }
}

function patchEntry(
  playId: string,
  mutate: (entry: PlayOutboxEntry) => void,
): void {
  const file = readOutbox();
  const entry = file.plays.find((p) => p.playId === playId);
  if (!entry) return;
  mutate(entry);
  writeOutbox(file);
}

function scheduleFlush(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void enqueue(flushOutbox);
  }, FLUSH_DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Flush
// ---------------------------------------------------------------------------

type SyncResult = "synced" | "rejected" | "retry";

/** 2xx → synced; other 4xx → permanently rejected; 5xx/network → retry. */
async function syncRequest(path: string, method: string, body: unknown): Promise<SyncResult> {
  let res: Response;
  try {
    res = await dodi.request(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof TypeError) {
      useConnectivityStore.getState().reportOffline();
    }
    return "retry";
  }
  if (res.ok) return "synced";
  return res.status >= 400 && res.status < 500 ? "rejected" : "retry";
}

async function flushOutbox(): Promise<void> {
  let file = readOutbox();

  for (const play of [...file.plays]) {
    if (!play.isStartSynced) {
      const result = await syncRequest(`/api/games/${play.gameId}/plays`, "POST", {
        kidId: play.kidId,
        playId: play.playId,
        startedAt: play.startedAt,
      });
      if (result === "retry") return;
      if (result === "rejected") {
        // Deleted game / foreign id collision — this play can never sync.
        file = readOutbox();
        file.plays = file.plays.filter((p) => p.playId !== play.playId);
        writeOutbox(file);
        continue;
      }
      patchEntry(play.playId, (e) => {
        e.isStartSynced = true;
      });
    }

    // Re-read: patches may have landed while the POST was in flight.
    const current = readOutbox().plays.find((p) => p.playId === play.playId);
    if (!current) continue;
    if (current.hasUnsyncedPatch || current.isEnded) {
      const result = await syncRequest(
        `/api/games/${current.gameId}/plays/${current.playId}`,
        "PATCH",
        {
          finalProgress: current.finalProgress,
          metrics: current.metrics,
          succeeded: current.succeeded,
          succeededAt: current.succeededAt,
          ended: current.isEnded ? true : undefined,
          endedAt: current.isEnded ? current.endedAt : undefined,
        },
      );
      if (result === "retry") return;
      file = readOutbox();
      if (result === "rejected" || current.isEnded) {
        file.plays = file.plays.filter((p) => p.playId !== play.playId);
        writeOutbox(file);
      } else {
        patchEntry(play.playId, (e) => {
          e.hasUnsyncedPatch = false;
        });
      }
    }
  }

  for (const event of [...readOutbox().events]) {
    const result = await syncRequest(
      `/api/games/${event.gameId}/events`,
      "POST",
      {
        kidId: event.kidId,
        event: event.event,
        message: event.message,
        occurredAt: event.occurredAt,
      },
    );
    if (result === "retry") return;
    const current = readOutbox();
    current.events = current.events.filter((e) => e.id !== event.id);
    writeOutbox(current);
  }
}

// ---------------------------------------------------------------------------
// Public API (all recording is synchronous — see module header)
// ---------------------------------------------------------------------------

/** Start tracking a play. Returns the client-generated play id immediately. */
export function startPlay(input: { gameId: string; kidId: string }): string {
  const entry: PlayOutboxEntry = {
    playId: crypto.randomUUID(),
    gameId: input.gameId,
    kidId: input.kidId,
    startedAt: new Date().toISOString(),
    isStartSynced: false,
    hasUnsyncedPatch: false,
    isEnded: false,
  };
  const file = readOutbox();
  file.plays.push(entry);
  writeOutbox(file);
  scheduleFlush();
  return entry.playId;
}

/** Coalesce a progress/success patch into the play's outbox entry. */
export function recordPlayPatch(
  playId: string,
  patch: {
    succeeded?: boolean;
    finalProgress?: number;
    metrics?: MetricsSummary;
  },
): void {
  patchEntry(playId, (entry) => {
    if (patch.succeeded && !entry.succeeded) {
      entry.succeeded = true;
      entry.succeededAt = new Date().toISOString();
    }
    if (typeof patch.finalProgress === "number") {
      entry.finalProgress = patch.finalProgress;
    }
    if (patch.metrics) entry.metrics = patch.metrics;
    entry.hasUnsyncedPatch = true;
  });
  scheduleFlush();
}

/** Mark the play ended (unmount). The outbox write is the crash persistence. */
export function finalizePlay(
  playId: string,
  final: { finalProgress?: number; metrics?: MetricsSummary },
): void {
  patchEntry(playId, (entry) => {
    if (typeof final.finalProgress === "number") {
      entry.finalProgress = final.finalProgress;
    }
    if (final.metrics) entry.metrics = final.metrics;
    entry.isEnded = true;
    entry.endedAt = new Date().toISOString();
    entry.hasUnsyncedPatch = true;
  });
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  void enqueue(flushOutbox);
}

/** Queue a game event for the parent activities feed. */
export function logGameEvent(input: {
  gameId: string;
  kidId: string;
  event: string;
  message: string;
}): void {
  const file = readOutbox();
  file.events.push({
    id: crypto.randomUUID(),
    gameId: input.gameId,
    kidId: input.kidId,
    event: input.event,
    message: input.message,
    occurredAt: new Date().toISOString(),
  });
  writeOutbox(file);
  scheduleFlush();
}

/** Flush the backlog now (kid layout mount, offline→online transition). */
export function flushPlayOutbox(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return enqueue(flushOutbox);
}

/** Test-only: reset module state between cases. */
export function _resetForTests(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  chain = Promise.resolve();
}
