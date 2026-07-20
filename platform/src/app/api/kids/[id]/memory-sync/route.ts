import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getKid, updateKid } from "@/services/kids";
import {
  createMemory,
  createMemorySources,
  discardMemoryBySystem,
  updateTranscript,
} from "@/services/memory";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Batch apply client-side memory analysis results in one request:
 * - create memories (+ supports sources)
 * - reinforce (add supports sources to existing memories)
 * - system-discard (contradicts + discard fields)
 * - mark transcripts processed
 * - optional encrypted kids.memory dossier patch
 *
 * All content fields are opaque ciphertext.
 */
const SyncSchema = z.object({
  creates: z
    .array(
      z.object({
        content_enc: z.string().min(1).max(20000),
        category: z.string().max(64).nullable().optional(),
        sources: z
          .array(
            z.object({
              transcript_entry_id: z.string().uuid(),
              relation: z.enum(["supports", "contradicts"]).default("supports"),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .max(50)
    .default([]),
  reinforces: z
    .array(
      z.object({
        memoryId: z.string().uuid(),
        sources: z
          .array(
            z.object({
              transcript_entry_id: z.string().uuid(),
              relation: z.enum(["supports", "contradicts"]).default("supports"),
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .max(50)
    .default([]),
  discards: z
    .array(
      z.object({
        memoryId: z.string().uuid(),
        transcriptEntryId: z.string().uuid(),
      }),
    )
    .max(50)
    .default([]),
  markProcessedTranscriptIds: z.array(z.string().uuid()).max(30).default([]),
  /** Opaque enc:v1: dossier markdown; omit to leave kids.memory unchanged. */
  memoryDossierEnc: z.string().max(100000).nullable().optional(),
});

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id: kidId } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  try {
    const kid = await getKid(supabase, kidId);
    if (!kid || kid.account_id !== accountId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body: unknown = await request.json();
    const parsed = SyncSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const {
      creates,
      reinforces,
      discards,
      markProcessedTranscriptIds,
      memoryDossierEnc,
    } = parsed.data;

    const created = [];
    for (const c of creates) {
      const memory = await createMemory(supabase, {
        account_id: accountId,
        kid_id: kidId,
        content_enc: c.content_enc,
        category: c.category ?? null,
        status: "active",
      });
      const sources = await createMemorySources(
        supabase,
        c.sources.map((s) => ({
          memory_id: memory.id,
          transcript_entry_id: s.transcript_entry_id,
          relation: s.relation,
        })),
      );
      created.push({ ...memory, sources });
    }

    const reinforced = [];
    for (const r of reinforces) {
      const sources = await createMemorySources(
        supabase,
        r.sources.map((s) => ({
          memory_id: r.memoryId,
          transcript_entry_id: s.transcript_entry_id,
          relation: s.relation,
        })),
      );
      reinforced.push({ memoryId: r.memoryId, sources });
    }

    const discarded = [];
    for (const d of discards) {
      discarded.push(
        await discardMemoryBySystem(supabase, {
          memoryId: d.memoryId,
          transcriptEntryId: d.transcriptEntryId,
        }),
      );
    }

    const now = new Date().toISOString();
    for (const tid of markProcessedTranscriptIds) {
      await updateTranscript(supabase, tid, {
        status: "processed",
        processed_at: now,
      });
    }

    if (memoryDossierEnc !== undefined) {
      await updateKid(supabase, kidId, { memory: memoryDossierEnc });
    }

    return NextResponse.json({
      created,
      reinforced,
      discarded,
      processedTranscriptIds: markProcessedTranscriptIds,
    });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to sync memory",
      "api/kids/[id]/memory-sync#POST",
      { accountId },
    );
  }
}
