import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { getKid } from "@/services/kids";
import {
  getTranscriptByDay,
  insertTranscriptEntries,
  listTranscripts,
  upsertTranscript,
} from "@/services/memory";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const EntryInSchema = z.object({
  /** Client-generated UUID; doubles as the idempotency key for retries. */
  id: z.string().uuid(),
  role: z.enum(["dodi", "kid"]),
  /** Opaque enc:v1: ciphertext — server never decrypts. */
  content_enc: z.string().min(1).max(50000),
  occurred_at: z.string().datetime(),
});

const AppendSchema = z.object({
  /** Local calendar day YYYY-MM-DD */
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  personaId: z.string().uuid().nullable().optional(),
  /** E2EE JSON mirror of ALL of the day's entries (ids + text). */
  contentEnc: z.string().min(1).max(2_000_000),
  entries: z.array(EntryInSchema).min(1).max(200),
});

/**
 * GET transcripts. `?date=YYYY-MM-DD` returns the single day row (or null);
 * otherwise lists day rows (optional ?status=, ?limit=). Entry rows are never
 * embedded — readers use the content_enc day mirror.
 */
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

    const date = searchParams.get("date");
    if (date) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "Invalid date" }, { status: 400 });
      }
      const transcript = await getTranscriptByDay(supabase, kidId, date);
      return NextResponse.json(transcript);
    }

    const status = searchParams.get("status") as "open" | "processed" | null;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "30", 10) || 30,
      100,
    );

    const transcripts = await listTranscripts(supabase, kidId, {
      status: status ?? undefined,
      limit,
    });

    return NextResponse.json(transcripts);
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to list transcripts",
      "api/kids/[id]/transcripts#GET",
      { accountId },
    );
  }
}

/**
 * POST: upsert the day transcript (status back to open, mirror replaced) and
 * append encrypted entries. Client-generated entry ids make retries idempotent.
 * Body: { localDate, personaId?, contentEnc, entries: [{ id, role, content_enc, occurred_at }] }
 */
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
    const parsed = AppendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { localDate, personaId, contentEnc, entries } = parsed.data;
    const transcript = await upsertTranscript(supabase, {
      accountId,
      kidId,
      localDate,
      personaId: personaId ?? kid.active_persona?.id ?? null,
      status: "open",
      contentEnc,
    });

    const inserted = await insertTranscriptEntries(
      supabase,
      entries.map((e) => ({
        id: e.id,
        transcript_id: transcript.id,
        account_id: accountId,
        kid_id: kidId,
        role: e.role,
        content_enc: e.content_enc,
        occurred_at: e.occurred_at,
      })),
    );

    return NextResponse.json(
      { transcript, insertedCount: inserted.length },
      { status: 201 },
    );
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to append transcript entries",
      "api/kids/[id]/transcripts#POST",
      { accountId },
    );
  }
}
