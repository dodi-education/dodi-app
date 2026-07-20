/**
 * DB-first transcript persistence for voice sessions.
 *
 * Coalesced rounds are recorded into an in-memory day model and a tiny
 * localStorage outbox, then flushed (debounced) to POST /api/kids/[id]/transcripts
 * together with a re-encrypted full-day mirror (transcripts.content_enc).
 * Acked entries leave the outbox immediately, so plaintext sits in
 * localStorage only for the seconds between a round and its ack — longer only
 * while offline or vault-locked. Entry ids are client-generated UUIDs, making
 * retries idempotent server-side.
 *
 * The day model is seeded from the stored mirror at connect and only ever
 * MERGED by id (never replaced), so concurrent rounds can't be orphaned.
 */

import { dodi } from "@/lib/api";
import {
  encryptTranscriptEntries,
  encryptTranscriptMirror,
  decryptTranscriptMirror,
  type TranscriptMirrorEntry,
} from "@dodi/vault";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import type { Transcript } from "@dodi/types/database";

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

// ---------------------------------------------------------------------------
// Module state (one active kid at a time, like the session store's refs)
// ---------------------------------------------------------------------------

let currentKidId: string | null = null;
let dayDate = "";
let dayEntries: TranscriptMirrorEntry[] = [];
let daySeeded = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
// All seed/flush work runs through one serialized chain so a seed can never
// interleave with a flush (replaces ad-hoc in-flight flags).
let chain: Promise<void> = Promise.resolve();

function enqueue(op: () => Promise<void>): Promise<void> {
  const run = chain.then(op, op).catch(() => {});
  chain = run;
  return run;
}

/** Local calendar day as YYYY-MM-DD (en-CA renders ISO-shaped). */
function localDay(): string {
  return new Date().toLocaleDateString("en-CA");
}

function outboxKey(kidId: string): string {
  return `dodi-transcript-outbox-${kidId}`;
}

function readOutbox(kidId: string): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(outboxKey(kidId));
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
      localStorage.removeItem(outboxKey(kidId));
      return;
    }
    const file: OutboxFile = {
      v: 1,
      kidId,
      entries: entries.slice(-OUTBOX_MAX_ENTRIES),
    };
    localStorage.setItem(outboxKey(kidId), JSON.stringify(file));
  } catch {
    // ignore (quota / unavailable) — entries remain in the day model
  }
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

function resolvePersonaId(kidId: string): string | null {
  return (
    useKidStore.getState().list?.find((k) => k.id === kidId)?.active_persona
      ?.id ?? null
  );
}

async function fetchDayMirror(
  kidId: string,
  date: string,
): Promise<TranscriptMirrorEntry[]> {
  const session = useVaultStore.getState().session;
  if (!session) return [];
  const res = await dodi.request(`/api/kids/${kidId}/transcripts?date=${date}`);
  if (!res.ok) throw new Error(`transcript day fetch failed (${res.status})`);
  const row = (await res.json()) as Transcript | null;
  return decryptTranscriptMirror(session, row?.content_enc) ?? [];
}

/** Seed today's day model from the stored mirror (merge, never replace). */
async function seedDay(kidId: string): Promise<void> {
  if (daySeeded || currentKidId !== kidId) return;
  if (!useVaultStore.getState().session) return; // locked — retry next connect
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
  const session = useVaultStore.getState().session;
  if (!session) return;

  const outbox = readOutbox(kidId);
  const pending = outbox.filter((e) => e.text.trim());
  if (pending.length === 0) return;

  const dates = [...new Set(pending.map((e) => e.localDate))].sort();
  const personaId = resolvePersonaId(kidId);

  for (const date of dates) {
    const group = pending.filter((e) => e.localDate === date);
    const groupEntries: TranscriptMirrorEntry[] = group.map((e) => ({
      id: e.id,
      role: e.role,
      text: e.text,
      occurred_at: e.occurredAt,
    }));

    let base: TranscriptMirrorEntry[];
    const isLiveDay =
      currentKidId === kidId && date === dayDate && daySeeded;
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
      const res = await dodi
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Start (or restart) tracking a kid's current day. Call at connect. */
export function beginDay(kidId: string): void {
  currentKidId = kidId;
  dayDate = localDay();
  dayEntries = [];
  daySeeded = false;
  // One-time residue cleanup of the pre-rework localStorage batching keys.
  try {
    localStorage.removeItem(`dodi-transcript-${kidId}`);
    localStorage.removeItem(`dodi-memory-pending-${kidId}`);
  } catch {
    // ignore
  }
}

/**
 * Record one coalesced speaker round. Synchronous — the outbox write IS the
 * crash persistence (beforeunload/pagehide just need the round flushed here).
 */
export function recordRound(round: RecordableRound): void {
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
    id: crypto.randomUUID(),
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
}

/** Seed today's mirror, then flush any outbox backlog. Call at connect. */
export function syncAndSeed(kidId: string): Promise<void> {
  return enqueue(async () => {
    await seedDay(kidId);
    await flushOutbox(kidId);
  });
}

/** Flush immediately (processMemoryNow / endSession / sleep). */
export function flushNow(kidId: string): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  return enqueue(() => flushOutbox(kidId));
}

/** Test-only: reset module state between cases. */
export function _resetForTests(): void {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  currentKidId = null;
  dayDate = "";
  dayEntries = [];
  daySeeded = false;
  chain = Promise.resolve();
}
