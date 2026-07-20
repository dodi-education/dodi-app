import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getKid } from "@/services/kids";
import {
  createMemory,
  createMemorySources,
  discardMemoryByParent,
  discardMemoryBySystem,
  listMemories,
  listMemorySources,
  listTranscriptEntriesByIds,
} from "@/services/memory";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CreateMemorySchema = z.object({
  content_enc: z.string().min(1).max(20000),
  category: z.string().max(64).nullable().optional(),
  sources: z
    .array(
      z.object({
        transcript_entry_id: z.string().uuid(),
        relation: z.enum(["supports", "contradicts"]),
      }),
    )
    .max(50)
    .optional(),
});

const DiscardSchema = z.object({
  memoryId: z.string().uuid(),
  by: z.enum(["system", "parent"]),
  /** Required when by === "system" */
  transcriptEntryId: z.string().uuid().optional(),
});

/** GET memories for a kid (?status=active|discarded, ?includeSources=1). */
export async function GET(
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

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") as "active" | "discarded" | null;
    const includeSources = searchParams.get("includeSources") === "1";

    const memories = await listMemories(supabase, kidId, {
      status: status ?? undefined,
    });

    if (!includeSources) {
      return NextResponse.json(memories);
    }

    const sources = await listMemorySources(
      supabase,
      memories.map((m) => m.id),
    );
    // Embed the cited entry (slim projection) on each source so dossier
    // citations resolve to their transcript turn without a second fetch.
    const entries = await listTranscriptEntriesByIds(supabase, [
      ...new Set(sources.map((s) => s.transcript_entry_id)),
    ]);
    const entryById = new Map(entries.map((e) => [e.id, e]));
    const byMem = new Map<
      string,
      Array<(typeof sources)[number] & { entry: (typeof entries)[number] | null }>
    >();
    for (const s of sources) {
      const list = byMem.get(s.memory_id) ?? [];
      list.push({ ...s, entry: entryById.get(s.transcript_entry_id) ?? null });
      byMem.set(s.memory_id, list);
    }

    return NextResponse.json(
      memories.map((m) => ({
        ...m,
        sources: byMem.get(m.id) ?? [],
      })),
    );
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list memories",
      "api/kids/[id]/memories#GET",
      { accountId },
    );
  }
}

/** POST create a memory (+ optional support/contradict sources). */
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
    const parsed = CreateMemorySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const memory = await createMemory(supabase, {
      account_id: accountId,
      kid_id: kidId,
      content_enc: parsed.data.content_enc,
      category: parsed.data.category ?? null,
      status: "active",
    });

    const sources = await createMemorySources(
      supabase,
      (parsed.data.sources ?? []).map((s) => ({
        memory_id: memory.id,
        transcript_entry_id: s.transcript_entry_id,
        relation: s.relation,
      })),
    );

    return NextResponse.json({ ...memory, sources }, { status: 201 });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to create memory",
      "api/kids/[id]/memories#POST",
      { accountId },
    );
  }
}

/**
 * PATCH discard a memory.
 * Body: { memoryId, by: "system"|"parent", transcriptEntryId? }
 * System discard requires transcriptEntryId (contradicts source).
 */
export async function PATCH(
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
    const parsed = DiscardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { memoryId, by, transcriptEntryId } = parsed.data;

    // Ownership: memory must belong to this kid
    const existing = await listMemories(supabase, kidId);
    if (!existing.some((m) => m.id === memoryId)) {
      return NextResponse.json({ error: "Memory not found" }, { status: 404 });
    }

    if (by === "system") {
      if (!transcriptEntryId) {
        return NextResponse.json(
          { error: "transcriptEntryId required for system discard" },
          { status: 400 },
        );
      }
      const result = await discardMemoryBySystem(supabase, {
        memoryId,
        transcriptEntryId,
      });
      return NextResponse.json(result);
    }

    const memory = await discardMemoryByParent(supabase, memoryId);
    return NextResponse.json({ memory });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to discard memory",
      "api/kids/[id]/memories#PATCH",
      { accountId },
    );
  }
}
