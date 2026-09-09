/**
 * Transcript + structured memory persistence. Content fields arrive as opaque
 * client ciphertext (content_enc); the server never decrypts.
 */

import { jsonObjectFrom } from "kysely/helpers/postgres";

import type {
  Memory,
  MemoryInsert,
  MemorySource,
  MemorySourceInsert,
  MemorySourceWithEntry,
  MemoryUpdate,
  Transcript,
  TranscriptEntry,
  TranscriptEntryInsert,
  TranscriptInsert,
  TranscriptUpdate,
} from "@dodi/types/database";

import type { Db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

/** Upsert the day-batch row for (kid_id, local_date); returns the row. */
export async function upsertTranscript(
  db: Db,
  input: {
    accountId: string;
    kidId: string;
    localDate: string;
    personaId?: string | null;
    status?: Transcript["status"];
    /** E2EE full-day mirror blob; replaces the stored mirror when provided. */
    contentEnc?: string;
  },
): Promise<Transcript> {
  const payload: TranscriptInsert = {
    account_id: input.accountId,
    kid_id: input.kidId,
    local_date: input.localDate,
    persona_id: input.personaId ?? null,
    status: input.status ?? "open",
    updated_at: new Date().toISOString(),
  };
  if (input.contentEnc !== undefined) payload.content_enc = input.contentEnc;

  return db
    .insertInto("transcripts")
    .values(payload)
    .onConflict((oc) =>
      oc.columns(["kid_id", "local_date"]).doUpdateSet((eb) => ({
        // Every column the payload carries is overwritten on conflict, exactly
        // like the former PostgREST upsert (merge-duplicates semantics).
        account_id: eb.ref("excluded.account_id"),
        persona_id: eb.ref("excluded.persona_id"),
        status: eb.ref("excluded.status"),
        updated_at: eb.ref("excluded.updated_at"),
        ...(input.contentEnc !== undefined
          ? { content_enc: eb.ref("excluded.content_enc") }
          : {}),
      })),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getTranscriptByDay(
  db: Db,
  kidId: string,
  localDate: string,
): Promise<Transcript | null> {
  const row = await db
    .selectFrom("transcripts")
    .selectAll()
    .where("kid_id", "=", kidId)
    .where("local_date", "=", localDate)
    .executeTakeFirst();
  return row ?? null;
}

export async function listTranscripts(
  db: Db,
  kidId: string,
  options: { status?: Transcript["status"]; limit?: number } = {},
): Promise<Transcript[]> {
  let q = db
    .selectFrom("transcripts")
    .selectAll()
    .where("kid_id", "=", kidId)
    .orderBy("local_date", "desc");

  if (options.status) q = q.where("status", "=", options.status);
  if (options.limit) q = q.limit(options.limit);

  return q.execute();
}

export async function updateTranscript(
  db: Db,
  transcriptId: string,
  patch: TranscriptUpdate,
): Promise<Transcript> {
  return db
    .updateTable("transcripts")
    .set({ ...patch, updated_at: new Date().toISOString() })
    .where("id", "=", transcriptId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/** Slim projections of entries cited by memory sources (content stays E2EE). */
export async function listTranscriptEntriesByIds(
  db: Db,
  entryIds: string[],
): Promise<Array<Pick<TranscriptEntry, "id" | "role" | "content_enc" | "occurred_at">>> {
  if (entryIds.length === 0) return [];
  return db
    .selectFrom("transcript_entries")
    .select(["id", "role", "content_enc", "occurred_at"])
    .where("id", "in", entryIds)
    .execute();
}

/**
 * Insert entries with client-generated ids; retries of a lost ack re-send the
 * same ids and are ignored (idempotent). Returns the newly inserted rows.
 */
export async function insertTranscriptEntries(
  db: Db,
  entries: TranscriptEntryInsert[],
): Promise<TranscriptEntry[]> {
  if (entries.length === 0) return [];

  return db
    .insertInto("transcript_entries")
    .values(entries)
    .onConflict((oc) => oc.column("id").doNothing())
    .returningAll()
    .execute();
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------

export async function listMemories(
  db: Db,
  kidId: string,
  options: { status?: Memory["status"] } = {},
): Promise<Memory[]> {
  let q = db
    .selectFrom("memories")
    .selectAll()
    .where("kid_id", "=", kidId)
    .orderBy("created_at", "asc");

  if (options.status) q = q.where("status", "=", options.status);

  return q.execute();
}

export async function createMemory(db: Db, input: MemoryInsert): Promise<Memory> {
  return db
    .insertInto("memories")
    .values(input)
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateMemory(
  db: Db,
  memoryId: string,
  patch: MemoryUpdate,
): Promise<Memory> {
  return db
    .updateTable("memories")
    .set(patch)
    .where("id", "=", memoryId)
    .returningAll()
    .executeTakeFirstOrThrow();
}

/**
 * Insert citation links; an already-cited (memory, entry, relation) triple is
 * ignored, not an error — reprocessed days legitimately re-cite entries.
 * Returns only the newly inserted rows.
 */
export async function createMemorySources(
  db: Db,
  sources: MemorySourceInsert[],
): Promise<MemorySource[]> {
  if (sources.length === 0) return [];
  return db
    .insertInto("memory_sources")
    .values(sources)
    .onConflict((oc) =>
      oc.columns(["memory_id", "transcript_entry_id", "relation"]).doNothing(),
    )
    .returningAll()
    .execute();
}

export async function listMemorySources(
  db: Db,
  memoryIds: string[],
): Promise<MemorySource[]> {
  if (memoryIds.length === 0) return [];
  return db
    .selectFrom("memory_sources")
    .selectAll()
    .where("memory_id", "in", memoryIds)
    .orderBy("created_at", "asc")
    .execute();
}

/**
 * Memory sources with their cited transcript entry embedded (slim projection,
 * content_enc stays E2EE) so dossier citations resolve without a second fetch.
 * `entry` is null when the entry row is gone.
 */
export async function listMemorySourcesWithEntries(
  db: Db,
  memoryIds: string[],
): Promise<MemorySourceWithEntry[]> {
  if (memoryIds.length === 0) return [];
  return db
    .selectFrom("memory_sources")
    .selectAll("memory_sources")
    .select((eb) =>
      jsonObjectFrom(
        eb
          .selectFrom("transcript_entries")
          .select([
            "transcript_entries.id",
            "transcript_entries.role",
            "transcript_entries.content_enc",
            "transcript_entries.occurred_at",
          ])
          .whereRef(
            "transcript_entries.id",
            "=",
            "memory_sources.transcript_entry_id",
          ),
      ).as("entry"),
    )
    .where("memory_sources.memory_id", "in", memoryIds)
    .orderBy("memory_sources.created_at", "asc")
    .execute();
}

/**
 * System discard: insert a contradicts source, then mark the memory discarded
 * with discard_memory_source_id (satisfies CHECK constraints).
 */
export async function discardMemoryBySystem(
  db: Db,
  input: {
    memoryId: string;
    transcriptEntryId: string;
  },
): Promise<{ memory: Memory; source: MemorySource }> {
  const run = async (trx: Db) => {
    let [source] = await createMemorySources(trx, [
      {
        memory_id: input.memoryId,
        transcript_entry_id: input.transcriptEntryId,
        relation: "contradicts",
      },
    ]);

    if (!source) {
      // The contradicts link already exists (duplicate-tolerant insert returned
      // nothing) — reuse it so the discard fields still point at a real source.
      source = await trx
        .selectFrom("memory_sources")
        .selectAll()
        .where("memory_id", "=", input.memoryId)
        .where("transcript_entry_id", "=", input.transcriptEntryId)
        .where("relation", "=", "contradicts")
        .executeTakeFirstOrThrow();
    }

    const memory = await updateMemory(trx, input.memoryId, {
      status: "discarded",
      discarded_at: new Date().toISOString(),
      discarded_by: "system",
      discard_memory_source_id: source.id,
    });

    return { memory, source };
  };

  // Two writes that must land together: the citation and the discard fields
  // that point at it. Nested calls reuse the caller's transaction.
  return db.isTransaction ? run(db) : db.transaction().execute(run);
}

/** Parent discard: no triggering source required. */
export async function discardMemoryByParent(
  db: Db,
  memoryId: string,
): Promise<Memory> {
  return updateMemory(db, memoryId, {
    status: "discarded",
    discarded_at: new Date().toISOString(),
    discarded_by: "parent",
    discard_memory_source_id: null,
  });
}
