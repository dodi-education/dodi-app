/**
 * Client-side memory analysis (E2EE). Lists open day transcripts, decrypts
 * each day's content_enc mirror (ONE blob per day — no per-entry fetching),
 * runs the thinking provider in the browser, then batch-writes
 * creates/reinforces/discards + an encrypted dossier via
 * POST /api/kids/[id]/memory-sync. The server never sees plaintext content.
 *
 * Greeting-only days (no kid entries) are marked processed without a model
 * call. Returns true only when the sync succeeds (or there was nothing to do).
 */
import { dodi } from "@/lib/api";
import { reportUsage } from "@/lib/usage/report-usage";
import { createClientThinkingProvider } from "@dodi/ai/client-thinking";
import {
  applyDossierCitations,
  buildMemoryUpdateInstruction,
  clampMemoryDossier,
  parseMemoryOpsResponse,
} from "@dodi/ai/memory-prompt";
import { resolveExecution } from "@/lib/ai/resolve-dodi-ai";
import { getActivePersona } from "@/lib/ai/voice-session";
import {
  decryptContent,
  decryptTranscriptMirror,
  encryptContent,
  encryptKidFields,
  type TranscriptMirrorEntry,
} from "@dodi/vault";
import { useKidStore } from "@/stores/kid-store";
import { useVaultStore } from "@/stores/vault-store";
import type { AccountModelConfig } from "@dodi/types/ai";
import type { Memory, Transcript } from "@dodi/types/database";

interface MemoryWithSources extends Memory {
  sources?: Array<{
    id: string;
    transcript_entry_id: string;
    relation: string;
  }>;
}

interface ProcessableDay {
  transcript: Transcript;
  entries: TranscriptMirrorEntry[];
}

export async function runClientMemoryUpdate(
  kidId: string,
  opts: { includeToday?: boolean } = {},
): Promise<boolean> {
  try {
    const kid = await useKidStore.getState().loadOne(kidId);
    if (!kid) return false;

    const session = useVaultStore.getState().session;
    if (!session) return false;

    const txRes = await dodi.request(
      `/api/kids/${kidId}/transcripts?status=open&limit=14`,
    );
    if (!txRes.ok) return false;
    const allTx = (await txRes.json()) as Transcript[];
    const today = new Date().toLocaleDateString("en-CA");
    const candidates = allTx.filter(
      (t) =>
        t.content_enc != null &&
        (opts.includeToday ? t.local_date <= today : t.local_date < today),
    );

    // One decrypt per day. An undecryptable/malformed mirror skips its day
    // (left open for a later retry) without blocking the others.
    const substantive: ProcessableDay[] = [];
    const trivialIds: string[] = [];
    for (const t of candidates) {
      const entries = decryptTranscriptMirror(session, t.content_enc);
      if (!entries || entries.length === 0) continue;
      if (entries.some((e) => e.role === "kid")) {
        substantive.push({ transcript: t, entries });
      } else {
        // Greeting-only day — close it without spending a model call.
        trivialIds.push(t.id);
      }
    }

    if (substantive.length === 0) {
      if (trivialIds.length === 0) return true; // nothing to process
      const res = await dodi.request(`/api/kids/${kidId}/memory-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markProcessedTranscriptIds: trivialIds }),
      });
      return res.ok;
    }

    const cfgRes = await dodi.request("/api/ai/config");
    if (!cfgRes.ok) return false;
    const config = (await cfgRes.json()) as AccountModelConfig | null;
    if (!config) return false;

    if (!config.thinkingProvider) return false;
    const resolved = await resolveExecution({
      provider: config.thinkingProvider,
      category: "thinking",
      model: config.thinkingModel,
    });
    if (!resolved) return false;
    const { provider: thinkingProvider, model: thinkingModel, apiKey } = resolved;

    const memRes = await dodi.request(
      `/api/kids/${kidId}/memories?status=active&includeSources=1`,
    );
    const activeMemories: MemoryWithSources[] = memRes.ok
      ? ((await memRes.json()) as MemoryWithSources[])
      : [];

    const persona = await getActivePersona(kid.active_persona?.id ?? null);
    const instruction = buildMemoryUpdateInstruction(persona.soul);

    const entryLines: string[] = [];
    const knownEntryIds = new Set<string>();
    for (const { transcript, entries } of substantive) {
      entryLines.push(
        `### Day ${transcript.local_date} (transcript ${transcript.id})`,
      );
      for (const e of entries) {
        knownEntryIds.add(e.id);
        entryLines.push(
          `- entry_id=${e.id} [${e.occurred_at}] ${e.role === "dodi" ? "Dodi" : "Kid"}: ${e.text}`,
        );
      }
    }

    const activeLines = activeMemories.map((m) => {
      const text = decryptContent(session, m.content_enc);
      const src =
        m.sources
          ?.map((s) => `${s.id}:${s.relation}:${s.transcript_entry_id}`)
          .join(", ") ?? "";
      return `- memory_id=${m.id} category=${m.category ?? "—"} :: ${text}${src ? ` [sources: ${src}]` : ""}`;
    });

    const prompt = [
      "## Current Briefing Dossier",
      kid.memory || "(empty — this was the first session)",
      "",
      "## Active Memories",
      activeLines.length > 0 ? activeLines.join("\n") : "(none)",
      "",
      "## New Transcript Entries",
      entryLines.join("\n"),
    ].join("\n");

    const provider = createClientThinkingProvider(
      thinkingProvider,
      apiKey,
      thinkingModel,
      (usage) =>
        reportUsage({
          eventType: "memory_update",
          kidId,
          provider: thinkingProvider,
          model: thinkingModel,
          usage,
          meta: {
            memoryChars: (kid.memory ?? "").length,
            personaChars: persona.soul.length,
            promptChars: prompt.length,
          },
        }),
    );

    let responseText: string;
    try {
      const json = await provider.generateJson(instruction, prompt);
      responseText = JSON.stringify(json);
    } catch {
      responseText = await provider.generateText(instruction, prompt);
    }

    const ops = parseMemoryOpsResponse(responseText);

    // Filter ops to known ids
    const activeIds = new Set(activeMemories.map((m) => m.id));
    const creates = ops.creates
      .map((c) => ({
        ...c,
        transcriptEntryIds: c.transcriptEntryIds.filter((id) =>
          knownEntryIds.has(id),
        ),
      }))
      .filter((c) => c.transcriptEntryIds.length > 0);
    const reinforces = ops.reinforces
      .map((r) => ({
        ...r,
        transcriptEntryIds: r.transcriptEntryIds.filter((id) =>
          knownEntryIds.has(id),
        ),
      }))
      .filter(
        (r) => activeIds.has(r.memoryId) && r.transcriptEntryIds.length > 0,
      );
    const discards = ops.discards.filter(
      (d) =>
        activeIds.has(d.memoryId) && knownEntryIds.has(d.transcriptEntryId),
    );

    let dossier = clampMemoryDossier(ops.dossier || kid.memory || "");

    const syncBody = {
      creates: creates.map((c) => ({
        content_enc: encryptContent(session, c.content),
        category: c.category,
        sources: c.transcriptEntryIds.map((id) => ({
          transcript_entry_id: id,
          relation: "supports" as const,
        })),
      })),
      reinforces: reinforces.map((r) => ({
        memoryId: r.memoryId,
        sources: r.transcriptEntryIds.map((id) => ({
          transcript_entry_id: id,
          relation: "supports" as const,
        })),
      })),
      discards: discards.map((d) => ({
        memoryId: d.memoryId,
        transcriptEntryId: d.transcriptEntryId,
      })),
      markProcessedTranscriptIds: [
        ...substantive.map((d) => d.transcript.id),
        ...trivialIds,
      ],
    };

    // First pass without dossier so we get new source ids for citations
    const syncRes = await dodi.request(`/api/kids/${kidId}/memory-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(syncBody),
    });
    if (!syncRes.ok) return false;

    const syncJson = (await syncRes.json()) as {
      created: Array<{
        id: string;
        content_enc: string;
        sources: Array<{ id: string; relation: string }>;
      }>;
    };

    const citationHints = (syncJson.created ?? []).map((m) => {
      const content = decryptContent(session, m.content_enc);
      const sourceIds = (m.sources ?? [])
        .filter((s) => s.relation === "supports")
        .map((s) => s.id);
      return { content, sourceIds };
    });
    dossier = applyDossierCitations(dossier, citationHints);
    dossier = clampMemoryDossier(dossier);

    const enc = encryptKidFields(session, { memory: dossier });
    const patchRes = await dodi.request(`/api/kids/${kidId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory: enc.memory }),
    });
    if (!patchRes.ok) return false;

    useKidStore.getState().invalidate();
    return true;
  } catch {
    return false;
  }
}
