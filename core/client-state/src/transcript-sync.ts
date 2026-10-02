/**
 * DB-first transcript persistence for voice sessions.
 *
 * Coalesced rounds are recorded into an in-memory day model and a tiny
 * device-storage outbox, then flushed (debounced) to POST /api/kids/[id]/transcripts
 * together with a re-encrypted full-day mirror (transcripts.content_enc).
 * Acked entries leave the outbox immediately, so plaintext sits in device
 * storage only for the seconds between a round and its ack — longer only
 * while offline or vault-locked. Entry ids are client-generated UUIDs, making
 * retries idempotent server-side.
 *
 * The day model is seeded from the stored mirror at connect and only ever
 * MERGED by id (never replaced), so concurrent rounds can't be orphaned.
 * One instance per companion session (one active kid at a time).
 */

import {
  encryptTranscriptEntries,
  encryptTranscriptMirror,
  decryptTranscriptMirror,
  type TranscriptMirrorEntry,
  type VaultSession,
} from "@dodi/vault";
import type { Transcript } from "@dodi/types/database";

import type { DeviceStorage, PlatformApi } from "./platform";

export interface RecordableRound {
  role: "dodi" | "kid";
  text: string;
  /** ISO timestamp of the round start. */
  occurredAt: string;
}

interface OutboxEntry {
  id: string;
  role: "dodi" | "kid";
  text: string;
  occurredAt: string;
  /** Local day stamped at record time — routes the entry to its transcript. */
  localDate: string;
}

interface OutboxFile {
  v: 1;
  kidId: string;
  entries: OutboxEntry[];
}

const FLUSH_DEBOUNCE_MS = 400;
// Outbox only grows while offline/vault-locked; drop oldest past this.
const OUTBOX_MAX_ENTRIES = 500;
// Cap the mirror blob (oldest dropped from the MIRROR only; entry rows stay).
const MIRROR_MAX_ENTRIES = 2000;
// POST body allows at most 200 entries — large offline backlogs go in chunks.
const FLUSH_MAX_ENTRIES_PER_POST = 200;

export interface TranscriptSyncDeps {
  api: Pick<PlatformApi, "request">;
  /** The unlocked vault session, null while locked. */
  getSession(): VaultSession | null;
  /** The kid's active persona id (from the kid cache), for the transcript row. */
  getPersonaId(kidId: string): string | null;
  /** Synchronous device storage for the outbox (web: localStorage). */
  storage: DeviceStorage;
  randomUUID(): string;
}

export interface TranscriptSync {
  /** Start (or restart) tracking a kid's current day. Call at connect. */
  beginDay(kidId: string): void;
  /**
   * Record one coalesced speaker round. Synchronous: the outbox write IS the
   * crash persistence (unload just needs the round flushed here).
   */
  recordRound(round: RecordableRound): void;
  /** Seed today's mirror, then flush any outbox backlog. Call at connect. */
  syncAndSeed(kidId: string): Promise<void>;
  /** Flush immediately (processMemoryNow / endSession / sleep). */
  flushNow(kidId: string): Promise<void>;
}

/** Local calendar day as YYYY-MM-DD (en-CA renders ISO-shaped). */
function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

function outboxKey(kidId: string): string {
  return `dodi-transcript-outbox-${kidId}`;
}

function sortByOccurredAt(entries: TranscriptMirrorEntry[]): TranscriptMirrorEntry[] {
  return [...entries].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

/** Merge two entry lists by id (first list wins on conflict), sorted by time. */
function mergeById(
  base: TranscriptMirrorEntry[],
  additions: TranscriptMirrorEntry[],
): TranscriptMirrorEntry[] {
  const seen = new Set(base.map((e) => e.id));
  const merged = [...base, ...additions.filter((e) => !seen.has(e.id))];
  return sortByOccurredAt(merged).slice(-MIRROR_MAX_ENTRIES);
}

export function createTranscriptSync(deps: TranscriptSyncDeps): TranscriptSync {
  const { api, storage } = deps;

  let currentKidId: string | null = null;
  let dayDate = "";
  let dayEntries: TranscriptMirrorEntry[] = [];
  let daySeeded = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  // All seed/flush work runs through one serialized chain so a seed can never
  // interleave with a flush.
  let chain: Promise<void> = Promise.resolve();

  function enqueue(op: () => Promise<void>): Promise<void> {
    const run = chain.then(op, op).catch(() => {});
    chain = run;
    return run;
  }

  function readOutbox(kidId: string): OutboxEntry[] {
    try {
      const raw = storage.getItem(outboxKey(kidId));
      if (!raw) return [];
      const file = JSON.parse(raw) as OutboxFile;
      if (file.v !== 1 || !Array.isArray(file.entries)) return [];
      return file.entries;
    } catch {
      return [];
    }
  }

  function writeOutbox(kidId: string, entries: OutboxEntry[]): void {
    try {
      if (entries.length === 0) {
        storage.removeItem(outboxKey(kidId));
        return;
      }
      const file: OutboxFile = {
        v: 1,
        kidId,
        entries: entries.slice(-OUTBOX_MAX_ENTRIES),
      };
      storage.setItem(outboxKey(kidId), JSON.stringify(file));
    } catch {
      // ignore (quota / unavailable) — entries remain in the day model
    }
  }

  async function fetchDayMirror(kidId: string, date: string): Promise<TranscriptMirrorEntry[]> {
    const session = deps.getSession();
    if (!session) return [];
    const res = await api.request(`/api/kids/${kidId}/transcripts?date=${date}`);
    if (!res.ok) throw new Error(`transcript day fetch failed (${res.status})`);
    const row = (await res.json()) as Transcript | null;
    return decryptTranscriptMirror(session, row?.content_enc) ?? [];
  }

  /** Seed today's day model from the stored mirror (merge, never replace). */
  async function seedDay(kidId: string): Promise<void> {
    if (daySeeded || currentKidId !== kidId) return;
    if (!deps.getSession()) return; // locked — retry next connect
    try {
      const mirror = await fetchDayMirror(kidId, dayDate);
      if (currentKidId !== kidId) return;
      dayEntries = mergeById(mirror, dayEntries);
      daySeeded = true;
    } catch {
      // network failure — day model keeps local rounds; seed retries later
    }
  }

  /**
   * Flush all outbox entries, grouped per local day (oldest day first). Each
   * group POSTs its new entries plus the re-encrypted full-day mirror. On ack
   * the group leaves the outbox; any failure aborts and leaves the rest for the
   * next flush.
   */
  async function flushOutbox(kidId: string): Promise<void> {
    const session = deps.getSession();
    if (!session) return;

    const outbox = readOutbox(kidId);
    const pending = outbox.filter((e) => e.text.trim());
    if (pending.length === 0) return;

    const dates = [...new Set(pending.map((e) => e.localDate))].sort();
    const personaId = deps.getPersonaId(kidId);

    for (const date of dates) {
      const group = pending.filter((e) => e.localDate === date);
      const groupEntries: TranscriptMirrorEntry[] = group.map((e) => ({
        id: e.id,
        role: e.role,
        text: e.text,
        occurred_at: e.occurredAt,
      }));

      let base: TranscriptMirrorEntry[];
      const isLiveDay = currentKidId === kidId && date === dayDate && daySeeded;
      if (isLiveDay) {
        base = dayEntries;
      } else {
        // Crash recovery / stale day / pre-seed: merge onto the stored mirror.
        try {
          base = await fetchDayMirror(kidId, date);
        } catch {
          return; // offline — keep outbox, retry later
        }
      }

      const merged = mergeById(base, groupEntries);
      const mirrorBlob = encryptTranscriptMirror(session, merged);

      for (let i = 0; i < group.length; i += FLUSH_MAX_ENTRIES_PER_POST) {
        const chunk = group.slice(i, i + FLUSH_MAX_ENTRIES_PER_POST);
        const res = await api
          .request(`/api/kids/${kidId}/transcripts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              localDate: date,
              personaId,
              contentEnc: mirrorBlob,
              entries: encryptTranscriptEntries(
                session,
                chunk.map((e) => ({
                  id: e.id,
                  role: e.role,
                  text: e.text,
                  occurredAt: e.occurredAt,
                })),
              ),
            }),
          })
          .catch(() => null);
        if (!res || !res.ok) return; // keep the un-acked rest, retry later

        const ackedIds = new Set(chunk.map((e) => e.id));
        writeOutbox(
          kidId,
          readOutbox(kidId).filter((e) => !ackedIds.has(e.id)),
        );
      }
      if (currentKidId === kidId && date === dayDate) {
        dayEntries = merged;
        daySeeded = true;
      }
    }
  }

  function scheduleFlush(kidId: string): void {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void enqueue(() => flushOutbox(kidId));
    }, FLUSH_DEBOUNCE_MS);
  }

  return {
    beginDay(kidId) {
      currentKidId = kidId;
      dayDate = localDay();
      dayEntries = [];
      daySeeded = false;
      // One-time residue cleanup of the pre-rework storage batching keys.
      try {
        storage.removeItem(`dodi-transcript-${kidId}`);
        storage.removeItem(`dodi-memory-pending-${kidId}`);
      } catch {
        // ignore
      }
    },

    recordRound(round) {
      const kidId = currentKidId;
      const text = round.text.trim();
      if (!kidId || !text) return;

      // Midnight rollover: further rounds belong to the new local day.
      const today = localDay();
      if (today !== dayDate) {
        dayDate = today;
        dayEntries = [];
        daySeeded = false;
      }

      const entry: OutboxEntry = {
        id: deps.randomUUID(),
        role: round.role,
        text,
        occurredAt: round.occurredAt,
        localDate: dayDate,
      };
      dayEntries = mergeById(dayEntries, [
        { id: entry.id, role: entry.role, text, occurred_at: entry.occurredAt },
      ]);
      writeOutbox(kidId, [...readOutbox(kidId), entry]);
      scheduleFlush(kidId);
    },

    syncAndSeed(kidId) {
      return enqueue(async () => {
        await seedDay(kidId);
        await flushOutbox(kidId);
      });
    },

    flushNow(kidId) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      return enqueue(() => flushOutbox(kidId));
    },
  };
}
