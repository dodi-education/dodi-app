/**
 * Transcript + structured memory persistence. Content fields arrive as opaque
 * client ciphertext (content_enc); the server never decrypts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  Database,
  Memory,
  MemoryInsert,
  MemorySource,
  MemorySourceInsert,
  MemoryUpdate,
  Transcript,
  TranscriptEntry,
  TranscriptEntryInsert,
  TranscriptInsert,
  TranscriptUpdate,
} from "@dodi/types/database";

type Client = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Transcripts
// ---------------------------------------------------------------------------

/** Upsert the day-batch row for (kid_id, local_date); returns the row. */
export async function upsertTranscript(
  supabase: Client,
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

  const { data, error } = await supabase
    .from("transcripts")
    .upsert(payload, { onConflict: "kid_id,local_date" })
    .select("*")
    .single();

  if (error) throw error;
  return data as unknown as Transcript;
}

export async function getTranscriptByDay(
  supabase: Client,
  kidId: string,
  localDate: string,
): Promise<Transcript | null> {
  const { data, error } = await supabase
    .from("transcripts")
    .select("*")
    .eq("kid_id", kidId)
    .eq("local_date", localDate)
    .maybeSingle();

  if (error) throw error;
  return (data as Transcript | null) ?? null;
}

export async function listTranscripts(
  supabase: Client,
  kidId: string,
  options: { status?: Transcript["status"]; limit?: number } = {},
): Promise<Transcript[]> {
  let q = supabase
    .from("transcripts")
    .select("*")
    .eq("kid_id", kidId)
    .order("local_date", { ascending: false });

  if (options.status) q = q.eq("status", options.status);
  if (options.limit) q = q.limit(options.limit);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Transcript[];
}

export async function updateTranscript(
  supabase: Client,
  transcriptId: string,
  patch: TranscriptUpdate,
): Promise<Transcript> {
  const { data, error } = await supabase
    .from("transcripts")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", transcriptId)
    .select("*")
    .single();

  if (error) throw error;
  return data as unknown as Transcript;
}

/** Slim projections of entries cited by memory sources (content stays E2EE). */
export async function listTranscriptEntriesByIds(
  supabase: Client,
  entryIds: string[],
): Promise<Array<Pick<TranscriptEntry, "id" | "role" | "content_enc" | "occurred_at">>> {
  if (entryIds.length === 0) return [];
  const { data, error } = await supabase
    .from("transcript_entries")
    .select("id, role, content_enc, occurred_at")
    .in("id", entryIds);

  if (error) throw error;
  return (data ?? []) as unknown as Array<
    Pick<TranscriptEntry, "id" | "role" | "content_enc" | "occurred_at">
  >;
}

/**
 * Insert entries with client-generated ids; retries of a lost ack re-send the
 * same ids and are ignored (idempotent). Returns the newly inserted rows.
 */
export async function insertTranscriptEntries(
  supabase: Client,
  entries: TranscriptEntryInsert[],
): Promise<TranscriptEntry[]> {
  if (entries.length === 0) return [];

  const { data, error } = await supabase
    .from("transcript_entries")
    .upsert(entries, { onConflict: "id", ignoreDuplicates: true })
    .select("*");

  if (error) throw error;
  return (data ?? []) as unknown as TranscriptEntry[];
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------

export async function listMemories(
  supabase: Client,
  kidId: string,
  options: { status?: Memory["status"] } = {},
): Promise<Memory[]> {
  let q = supabase
    .from("memories")
    .select("*")
    .eq("kid_id", kidId)
    .order("created_at", { ascending: true });

  if (options.status) q = q.eq("status", options.status);

  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as unknown as Memory[];
}

export async function createMemory(
  supabase: Client,
  input: MemoryInsert,
): Promise<Memory> {
  const { data, error } = await supabase
    .from("memories")
    .insert(input)
    .select("*")
    .single();

  if (error) throw error;
  return data as unknown as Memory;
}

export async function updateMemory(
  supabase: Client,
  memoryId: string,
  patch: MemoryUpdate,
): Promise<Memory> {
  const { data, error } = await supabase
    .from("memories")
    .update(patch)
    .eq("id", memoryId)
    .select("*")
    .single();

  if (error) throw error;
  return data as unknown as Memory;
}

/**
 * Insert citation links; an already-cited (memory, entry, relation) triple is
 * ignored, not an error — reprocessed days legitimately re-cite entries.
 * Returns only the newly inserted rows.
 */
export async function createMemorySources(
  supabase: Client,
  sources: MemorySourceInsert[],
): Promise<MemorySource[]> {
  if (sources.length === 0) return [];
  const { data, error } = await supabase
    .from("memory_sources")
    .upsert(sources, {
      onConflict: "memory_id,transcript_entry_id,relation",
      ignoreDuplicates: true,
    })
    .select("*");

  if (error) throw error;
  return (data ?? []) as unknown as MemorySource[];
}

export async function listMemorySources(
  supabase: Client,
  memoryIds: string[],
): Promise<MemorySource[]> {
  if (memoryIds.length === 0) return [];
  const { data, error } = await supabase
    .from("memory_sources")
    .select("*")
    .in("memory_id", memoryIds)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as MemorySource[];
}

/**
 * System discard: insert a contradicts source, then mark the memory discarded
 * with discard_memory_source_id (satisfies CHECK constraints).
 */
export async function discardMemoryBySystem(
  supabase: Client,
  input: {
    memoryId: string;
    transcriptEntryId: string;
  },
): Promise<{ memory: Memory; source: MemorySource }> {
  let [source] = await createMemorySources(supabase, [
    {
      memory_id: input.memoryId,
      transcript_entry_id: input.transcriptEntryId,
      relation: "contradicts",
    },
  ]);

  if (!source) {
    // The contradicts link already exists (duplicate-tolerant insert returned
    // nothing) — reuse it so the discard fields still point at a real source.
    const { data, error } = await supabase
      .from("memory_sources")
      .select("*")
      .eq("memory_id", input.memoryId)
      .eq("transcript_entry_id", input.transcriptEntryId)
      .eq("relation", "contradicts")
      .single();
    if (error) throw error;
    source = data as unknown as MemorySource;
  }

  const memory = await updateMemory(supabase, input.memoryId, {
    status: "discarded",
    discarded_at: new Date().toISOString(),
    discarded_by: "system",
    discard_memory_source_id: source.id,
  });

  return { memory, source };
}

/** Parent discard: no triggering source required. */
export async function discardMemoryByParent(
  supabase: Client,
  memoryId: string,
): Promise<Memory> {
  return updateMemory(supabase, memoryId, {
    status: "discarded",
    discarded_at: new Date().toISOString(),
    discarded_by: "parent",
    discard_memory_source_id: null,
  });
}
