/**
 * Client-side encrypt/decrypt for structured memory + transcript content.
 * Same enc:v1: field format as kid personal fields.
 */

import type { VaultSession } from "./session";

/** Seal a single plaintext string for transcript_entries.content_enc / memories.content_enc. */
export function encryptContent(
  session: VaultSession,
  plaintext: string,
): string {
  return session.encryptField(plaintext);
}

/** Open a sealed content_enc field; non-enc values pass through (legacy/dev). */
export function decryptContent(
  session: VaultSession,
  contentEnc: string,
): string {
  return session.decryptField(contentEnc) ?? "";
}

export interface PlainTranscriptEntry {
  /** Client-generated UUID == transcript_entries.id (citation anchor). */
  id: string;
  role: "dodi" | "kid";
  text: string;
  occurredAt: string;
}

/** Encrypt a batch of plain turns for POST /api/kids/[id]/transcripts. */
export function encryptTranscriptEntries(
  session: VaultSession,
  entries: PlainTranscriptEntry[],
): Array<{
  id: string;
  role: "dodi" | "kid";
  content_enc: string;
  occurred_at: string;
}> {
  return entries.map((e) => ({
    id: e.id,
    role: e.role,
    content_enc: encryptContent(session, e.text),
    occurred_at: e.occurredAt,
  }));
}

/**
 * One entry of the day mirror stored in transcripts.content_enc: the full
 * day's turns as ONE sealed JSON blob so the memory pipeline reads a day with
 * a single fetch + decrypt. `id` matches the transcript_entries row so memory
 * citations keep resolving.
 */
export interface TranscriptMirrorEntry {
  id: string;
  role: "dodi" | "kid";
  text: string;
  occurred_at: string;
}

interface TranscriptMirrorV1 {
  v: 1;
  entries: TranscriptMirrorEntry[];
}

/** Seal the full-day entry list for transcripts.content_enc. */
export function encryptTranscriptMirror(
  session: VaultSession,
  entries: TranscriptMirrorEntry[],
): string {
  const mirror: TranscriptMirrorV1 = { v: 1, entries };
  return session.encryptJson(mirror);
}

/**
 * Open a day mirror; returns null when the blob is missing, undecryptable, or
 * not a well-formed v1 mirror (callers treat null as "no usable mirror").
 */
export function decryptTranscriptMirror(
  session: VaultSession,
  contentEnc: string | null | undefined,
): TranscriptMirrorEntry[] | null {
  if (!contentEnc) return null;
  try {
    const mirror = session.decryptJson<TranscriptMirrorV1>(contentEnc);
    if (!mirror || mirror.v !== 1 || !Array.isArray(mirror.entries)) {
      return null;
    }
    return mirror.entries.filter(
      (e) =>
        typeof e?.id === "string" &&
        (e.role === "dodi" || e.role === "kid") &&
        typeof e.text === "string" &&
        typeof e.occurred_at === "string",
    );
  } catch {
    return null;
  }
}
