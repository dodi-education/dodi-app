/**
 * Browser-safe memory-update prompt builder + response parser (extracted from
 * the server `memory.ts` so it can run client-side under E2EE).
 *
 * Structured memories are first-class (create / reinforce / discard). The
 * kids.memory dossier is a derived markdown briefing with
 * `[source:{memory_source_id}]` citation markers filled in by the client after
 * memory_sources are inserted.
 */

export function buildMemoryUpdateInstruction(personaSoul: string): string {
  return `You are maintaining structured memories and a briefing dossier about a child for their AI learning companion.

You will receive:
1. The current briefing dossier (markdown; may be empty)
2. Active structured memories (id + content + existing source entry ids)
3. New transcript entries to process. Each entry has a stable UUID (transcript_entry_id), a role (Dodi/Kid), an ISO timestamp, and text.

Your task: decide what to CREATE, REINFORCE, or DISCARD, then produce an UPDATED briefing dossier.

## Persona Context
The following is the full persona soul document. Follow any ## Memory instructions you find in it for guidance on what to remember and what to discard. If there is no ## Memory section, use sensible defaults.

${personaSoul}

## Dossier Output Format
Write the briefing as a markdown document with these sections (create them as needed):

- **## About** — name, age, basic facts
- **## Interests** — topics, games, subjects they enjoy
- **## Strengths** — what they're good at, where they shine
- **## Challenges** — areas where they struggle or need support
- **## Learning Style** — how they learn best (visual, hands-on, etc.)
- **## Emotional Patterns** — how they handle frustration, what motivates them
- **## Session History** — a chronological log, oldest entry first, ONE bullet per session day in the exact form: \`- [YYYY-MM-DD]: brief summary of what happened and what was learned\`

## Rules
- Keep each section concise — bullet points, not paragraphs
- Date EVERY dated observation with an ISO date in square brackets: \`[YYYY-MM-DD]\` (e.g. "[2026-06-22] Loves dinosaurs"). Never use ambiguous formats like "June 22", "(Feb 28)", or weekday names.
- Take the date from the transcript's ISO timestamps on each entry (the day the conversation actually happened) — NOT today's date, since memory may be processed on a later day.
- Keep the Session History (and any other dated lists) sorted chronologically, oldest first. Append new dated entries; never reorder or rewrite past ones.
- For single observations, express uncertainty: "Seemed interested in..." vs "Loves..."
- Strengthen confidence after multiple observations: "Consistently enjoys..."
- Never remove information without good reason (e.g., contradicted by newer data)
- Preserve parent-provided context — you may reference it but never overwrite it
- Keep the total document under 2000 words
- Write in English regardless of the child's language setting
- Do NOT invent citation markers or UUIDs in the dossier — the client inserts [source:…] citations after creating memory_sources. You may leave a plain bullet; the client attaches sources from your ops.

## Response Format
You MUST respond with a JSON object (no markdown fences, no preamble):
{
  "creates": [
    {
      "content": "short observation to store as a structured memory",
      "category": "about|interests|strengths|challenges|learning_style|emotional|other",
      "transcript_entry_ids": ["uuid-of-supporting-entry", "..."]
    }
  ],
  "reinforces": [
    {
      "memory_id": "existing-active-memory-uuid",
      "transcript_entry_ids": ["uuid-of-new-supporting-entry"]
    }
  ],
  "discards": [
    {
      "memory_id": "existing-active-memory-uuid",
      "transcript_entry_id": "uuid-of-contradicting-entry",
      "reason": "brief why this memory is no longer valid"
    }
  ],
  "dossier": "the updated markdown briefing document"
}

- creates: new structured memories; each MUST list ≥1 supporting transcript_entry_id from the NEW entries.
- reinforces: existing active memories confirmed again; add supporting entry ids.
- discards: only when new evidence contradicts an active memory; transcript_entry_id is the contradicting entry (required).
- dossier: full updated markdown briefing reflecting active knowledge after these ops.
- Use empty arrays when nothing to do for that op type.
- Only reference memory_id values listed under Active Memories and transcript_entry_id values listed under New Transcript Entries.`;
}

export interface MemoryCreateOp {
  content: string;
  category: string | null;
  transcriptEntryIds: string[];
}

export interface MemoryReinforceOp {
  memoryId: string;
  transcriptEntryIds: string[];
}

export interface MemoryDiscardOp {
  memoryId: string;
  transcriptEntryId: string;
  reason: string;
}

export interface MemoryOpsResult {
  creates: MemoryCreateOp[];
  reinforces: MemoryReinforceOp[];
  discards: MemoryDiscardOp[];
  dossier: string;
}

/** @deprecated legacy shape; prefer MemoryOpsResult */
export interface MemoryUpdateResult {
  memory: string;
  stored: Array<{ observation: string; reason: string }>;
  discarded: Array<{ observation: string; reason: string }>;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function parseCreates(raw: unknown): MemoryCreateOp[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryCreateOp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const content =
      typeof o.content === "string"
        ? o.content
        : typeof o.observation === "string"
          ? o.observation
          : "";
    if (!content.trim()) continue;
    const ids = asStringArray(
      o.transcript_entry_ids ?? o.transcriptEntryIds ?? o.entry_ids,
    );
    if (ids.length === 0) continue;
    out.push({
      content: content.trim(),
      category: typeof o.category === "string" ? o.category : null,
      transcriptEntryIds: ids,
    });
  }
  return out;
}

function parseReinforces(raw: unknown): MemoryReinforceOp[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryReinforceOp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const memoryId =
      typeof o.memory_id === "string"
        ? o.memory_id
        : typeof o.memoryId === "string"
          ? o.memoryId
          : "";
    const ids = asStringArray(
      o.transcript_entry_ids ?? o.transcriptEntryIds ?? o.entry_ids,
    );
    if (!memoryId || ids.length === 0) continue;
    out.push({ memoryId, transcriptEntryIds: ids });
  }
  return out;
}

function parseDiscards(raw: unknown): MemoryDiscardOp[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryDiscardOp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const memoryId =
      typeof o.memory_id === "string"
        ? o.memory_id
        : typeof o.memoryId === "string"
          ? o.memoryId
          : "";
    const entryId =
      typeof o.transcript_entry_id === "string"
        ? o.transcript_entry_id
        : typeof o.transcriptEntryId === "string"
          ? o.transcriptEntryId
          : "";
    if (!memoryId || !entryId) continue;
    out.push({
      memoryId,
      transcriptEntryId: entryId,
      reason: typeof o.reason === "string" ? o.reason : "",
    });
  }
  return out;
}

/** Parse the AI response into structured ops + dossier. */
export function parseMemoryOpsResponse(text: string): MemoryOpsResult {
  try {
    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }
    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed !== "object" || parsed === null) {
      return emptyOps(text.trim());
    }
    const o = parsed as Record<string, unknown>;

    // New schema
    if ("dossier" in o || "creates" in o || "reinforces" in o || "discards" in o) {
      const dossier =
        typeof o.dossier === "string"
          ? o.dossier
          : typeof o.memory === "string"
            ? o.memory
            : "";
      return {
        creates: parseCreates(o.creates),
        reinforces: parseReinforces(o.reinforces),
        discards: parseDiscards(o.discards),
        dossier: dossier.trim(),
      };
    }

    // Legacy: { memory, stored, discarded } — map stored → creates without entry ids (empty creates)
    if (typeof o.memory === "string") {
      return {
        creates: [],
        reinforces: [],
        discards: [],
        dossier: o.memory.trim(),
      };
    }
  } catch {
    // graceful degradation
  }
  return emptyOps(text.trim());
}

function emptyOps(dossier: string): MemoryOpsResult {
  return { creates: [], reinforces: [], discards: [], dossier };
}

/**
 * @deprecated Use parseMemoryOpsResponse. Kept for existing tests/callers.
 * Maps legacy stored/discarded arrays; entry-linked ops are empty.
 */
export function parseMemoryUpdateResponse(text: string): MemoryUpdateResult {
  const ops = parseMemoryOpsResponse(text);
  try {
    let jsonStr = text.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    const parsed: unknown = JSON.parse(jsonStr);
    if (typeof parsed === "object" && parsed !== null && "stored" in parsed) {
      const p = parsed as {
        memory?: string;
        stored?: Array<{ observation: string; reason: string }>;
        discarded?: Array<{ observation: string; reason: string }>;
      };
      return {
        memory: typeof p.memory === "string" ? p.memory : ops.dossier,
        stored: Array.isArray(p.stored) ? p.stored : [],
        discarded: Array.isArray(p.discarded) ? p.discarded : [],
      };
    }
  } catch {
    /* fall through */
  }
  return { memory: ops.dossier, stored: [], discarded: [] };
}

/** Append `[source:memory_source_id]` citation markers to a dossier line / bullet. */
export function appendSourceCitations(
  line: string,
  memorySourceIds: string[],
): string {
  if (memorySourceIds.length === 0) return line;
  const markers = memorySourceIds.map((id) => `[source:${id}]`).join(" ");
  const trimmed = line.replace(/\s+$/, "");
  return `${trimmed} ${markers}`;
}

/**
 * Attach citations for newly created memories to matching dossier bullets.
 * Heuristic: if a dossier line contains the first ~40 chars of the memory
 * content (case-insensitive), append that memory's support source ids.
 */
export function applyDossierCitations(
  dossier: string,
  citations: Array<{ content: string; sourceIds: string[] }>,
): string {
  if (!dossier || citations.length === 0) return dossier;
  return dossier
    .split("\n")
    .map((line) => {
      let out = line;
      for (const c of citations) {
        if (c.sourceIds.length === 0) continue;
        const needle = c.content.trim().slice(0, 40).toLowerCase();
        if (needle.length < 8) continue;
        if (out.toLowerCase().includes(needle)) {
          out = appendSourceCitations(out, c.sourceIds);
        }
      }
      return out;
    })
    .join("\n");
}

/**
 * Remove citations of discarded memory sources from a dossier — the
 * deterministic client-side counterpart of a parent discard (no model call,
 * takes effect immediately). A line that loses ALL of its citations loses its
 * only support and is dropped entirely; a line with citations left keeps its
 * text minus the removed markers. The next regular memory update smooths the
 * narrative around the gap.
 */
export function removeDossierCitations(
  dossier: string,
  discardedSourceIds: string[],
): string {
  if (!dossier || discardedSourceIds.length === 0) return dossier;
  const discarded = new Set(discardedSourceIds);
  const re = /\s*\[source:([0-9a-f-]{36})\]/gi;

  return dossier
    .split("\n")
    .filter((line) => {
      const cited = [...line.matchAll(re)].map((m) => m[1]);
      if (cited.length === 0) return true;
      return cited.some((id) => !discarded.has(id));
    })
    .map((line) =>
      line.replace(re, (marker, id: string) =>
        discarded.has(id) ? "" : marker,
      ),
    )
    .join("\n");
}

/** Hard cap on the stored dossier size — anti-abuse + bounds future prompt cost. ~4000 words. */
export const MEMORY_MAX_WORDS = 4000;

/**
 * Clamp a memory dossier to at most `maxWords` words. Enforced client-side
 * BEFORE E2EE encryption — the server can never measure the sealed ciphertext,
 * so this is the only place a runaway or maliciously-inflated dossier can be
 * capped before it balloons every future generation's context.
 */
export function clampMemoryDossier(memory: string, maxWords = MEMORY_MAX_WORDS): string {
  const trimmed = memory.trim();
  if (!trimmed) return trimmed;
  const words = trimmed.split(/\s+/);
  return words.length <= maxWords ? memory : words.slice(0, maxWords).join(" ");
}
