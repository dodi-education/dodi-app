/**
 * A kid's memory page (/parent/kids/{id}/memory): the parent notes, the
 * narrative dossier with its `[source:<id>]` citations, and the structured
 * memories behind them (active and discarded).
 *
 * E2EE: notes, dossier, memory content and the cited transcript turns are all
 * sealed under the account vault; they are opened here on the device and
 * sealed again before a save.
 */
import { removeDossierCitations } from "@dodi/ai/memory-prompt";
import type { Memory, MemorySourceWithEntry } from "@dodi/types/database";
import { decryptContent, encryptKidFields, type VaultSession } from "@dodi/vault";

import { FlowError, jsonInit, serverErrorOf } from "./flow-error";
import type { KidStore } from "./kid-store";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

export interface KidMemoryDeps {
  api: PlatformApi;
  kids: KidStore;
  vault: VaultStore;
}

/** A structured memory with its sources and DECRYPTED content. */
export interface MemoryRow extends Memory {
  sources: MemorySourceWithEntry[];
  content: string;
}

/** Decrypted transcript turn backing one dossier citation. */
export interface CitationEntry {
  role: "dodi" | "kid";
  text: string;
  occurredAt: string;
}

// ----- Dossier citations -----------------------------------------------------

export interface DossierTextToken {
  type: "text";
  text: string;
}

export interface DossierCitationToken {
  type: "citation";
  sourceId: string;
  /** 1-based display number, stable per source id. */
  num: number;
}

export type DossierToken = DossierTextToken | DossierCitationToken;

const CITATION_RE = /\s*\[source:([0-9a-f-]{36})\]/gi;

/**
 * Tokenize a memory dossier for display: split the raw markdown into text
 * runs and `[source:<memory_source_id>]` citation markers. Citations are
 * numbered in reading order ([1], [2], …); the same source cited again reuses
 * its number.
 */
export function tokenizeDossier(dossier: string): DossierToken[] {
  const tokens: DossierToken[] = [];
  const numbers = new Map<string, number>();
  let lastIndex = 0;

  for (const m of dossier.matchAll(CITATION_RE)) {
    if (m.index > lastIndex) {
      tokens.push({ type: "text", text: dossier.slice(lastIndex, m.index) });
    }
    const sourceId = m[1].toLowerCase();
    let num = numbers.get(sourceId);
    if (num === undefined) {
      num = numbers.size + 1;
      numbers.set(sourceId, num);
    }
    tokens.push({ type: "citation", sourceId, num });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < dossier.length) {
    tokens.push({ type: "text", text: dossier.slice(lastIndex) });
  }
  return tokens;
}

/** The distinct source ids a dossier cites. */
export function parseCitationIds(dossier: string): string[] {
  const ids: string[] = [];
  const re = /\[source:([0-9a-f-]{36})\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(dossier)) !== null) {
    ids.push(m[1]);
  }
  return [...new Set(ids)];
}

// ----- Structured memories ----------------------------------------------------

async function memoriesOf(
  api: PlatformApi,
  session: VaultSession,
  kidId: string,
  status: "active" | "discarded",
): Promise<MemoryRow[]> {
  const res = await api.request(`/api/kids/${kidId}/memories?status=${status}&includeSources=1`);
  if (!res.ok) return [];
  const data = (await res.json()) as Array<Memory & { sources?: MemorySourceWithEntry[] }>;
  return data.map((m) => ({
    ...m,
    sources: m.sources ?? [],
    content: decryptContent(session, m.content_enc),
  }));
}

/** The kid's active and discarded memories, decrypted; null while the vault is locked. */
export async function loadKidMemories(
  deps: Pick<KidMemoryDeps, "api" | "vault">,
  kidId: string,
): Promise<{ active: MemoryRow[]; discarded: MemoryRow[] } | null> {
  const session = deps.vault.getState().session;
  if (!session) return null;
  const [active, discarded] = await Promise.all([
    memoriesOf(deps.api, session, kidId, "active"),
    memoriesOf(deps.api, session, kidId, "discarded"),
  ]);
  return { active, discarded };
}

/**
 * Every citation's decrypted transcript turn, keyed by memory_source_id (the
 * dossier's [n] popovers). Sources of discarded memories stay resolvable so
 * citations in an older dossier don't go dark.
 */
export function citationEntriesOf(
  rows: MemoryRow[],
  session: VaultSession | null,
): Map<string, CitationEntry> {
  const map = new Map<string, CitationEntry>();
  if (!session) return map;
  for (const m of rows) {
    for (const s of m.sources) {
      if (s.entry && !map.has(s.id)) {
        map.set(s.id, {
          role: s.entry.role,
          text: decryptContent(session, s.entry.content_enc),
          occurredAt: s.entry.occurred_at,
        });
      }
    }
  }
  return map;
}

// ----- Saves ----------------------------------------------------------------------

/**
 * Save the parent notes, and the dossier when the parent edited it (`memory`
 * undefined leaves it alone). Both sealed before they leave the device.
 */
export async function saveKidMemory(
  deps: KidMemoryDeps,
  kidId: string,
  fields: { parentNotes: string; memory?: string },
): Promise<void> {
  const session = deps.vault.getState().session;
  if (!session) throw new FlowError("vault_locked");
  const plain: { parent_notes: string | null; memory?: string | null } = {
    parent_notes: fields.parentNotes || null,
  };
  if (fields.memory !== undefined) plain.memory = fields.memory || null;
  const res = await deps.api.request(`/api/kids/${kidId}`, jsonInit("PATCH", encryptKidFields(session, plain)));
  if (!res.ok) throw new FlowError("request_failed", await serverErrorOf(res));
  deps.kids.getState().invalidate();
}

export interface DiscardResult {
  /** The dossier with the memory's citations stripped (unchanged when it had none). */
  memory: string;
  /** The stripped dossier could not be saved (the discard itself went through). */
  isDossierSaveFailed: boolean;
}

/**
 * The parent discards a memory. Its support disappears from the dossier
 * immediately: its citations (and lines they solely supported) are stripped,
 * deterministically and without a model call. While the parent is mid-edit
 * (`isEditingMemory`) only the returned text changes, so their eventual Save
 * persists the combined result; otherwise the stripped dossier is saved
 * sealed. Throws when the discard itself fails.
 */
export async function discardKidMemory(
  deps: KidMemoryDeps,
  input: {
    kidId: string;
    memoryId: string;
    activeMemories: MemoryRow[];
    memory: string;
    isEditingMemory: boolean;
  },
): Promise<DiscardResult> {
  // Capture the memory's citation ids BEFORE the lists reload.
  const target = input.activeMemories.find((m) => m.id === input.memoryId);
  const res = await deps.api.request(
    `/api/kids/${input.kidId}/memories`,
    jsonInit("PATCH", { memoryId: input.memoryId, by: "parent" }),
  );
  if (!res.ok) throw new FlowError("request_failed");

  const sourceIds = target?.sources.map((s) => s.id) ?? [];
  const updated = removeDossierCitations(input.memory, sourceIds);
  let isDossierSaveFailed = false;
  if (updated !== input.memory) {
    const session = deps.vault.getState().session;
    if (session && !input.isEditingMemory) {
      const enc = encryptKidFields(session, { memory: updated || null });
      const dossierRes = await deps.api.request(
        `/api/kids/${input.kidId}`,
        jsonInit("PATCH", { memory: enc.memory }),
      );
      if (dossierRes.ok) deps.kids.getState().invalidate();
      else isDossierSaveFailed = true;
    }
  }
  return { memory: updated, isDossierSaveFailed };
}
