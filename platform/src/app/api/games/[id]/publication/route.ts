import { NextResponse } from "next/server";
import { z } from "zod/v4";

import type { Json } from "@dodi/types/database";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import {
  PublicationError,
  getPublication,
  submitPublication,
  withdrawPublication,
} from "@/services/game-publications";
import { notifyPublicationSubmitted } from "@/services/publication-notifications";

/**
 * The publication copy of `[id]` — submit it for review, read its status, or
 * withdraw it.
 *
 * The body is PLAINTEXT: the browser decrypts the game before posting, because
 * a submission is a deliberate disclosure and the review pass has to read it.
 * The private game itself is never decrypted server-side. Writes go through the
 * service-role client (RLS forbids users writing publication rows) and are
 * scoped to the caller's account inside the service.
 */
const SubmitPublicationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5_000),
  codeBundle: z.string().min(1).max(600_000),
  markdown: z.string().max(100_000),
  learningGoal: z.string().max(2_000),
  successDefinition: z.string().max(2_000),
  successCriteria: z.record(z.string(), z.unknown()),
  previewImage: z.string().max(1_500_000).nullable(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Status of this game's submission, or `null` when it was never submitted. */
export async function GET(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId } = auth;

  try {
    const publication = await getPublication(serviceClient(), id, accountId);
    return NextResponse.json({ publication });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to fetch publication",
      "api/games/[id]/publication#GET",
      { accountId },
    );
  }
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId } = auth;

  const body: unknown = await request.json();
  const parsed = SubmitPublicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const service = serviceClient();
    const publication = await submitPublication(service, {
      sourceGameId: id,
      accountId,
      content: {
        ...parsed.data,
        successCriteria: parsed.data.successCriteria as Json,
      },
    });
    // Operator heads-up; fire-and-forget (never affects the response).
    void notifyPublicationSubmitted(service, publication);
    return NextResponse.json({ publication }, { status: 201 });
  } catch (error) {
    if (error instanceof PublicationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // An unsafe bundle throws from the sanitizer — that is the submitter's
    // problem to fix, not a server fault.
    if (error instanceof Error && error.message.startsWith("Unsafe game bundle")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return serverErrorResponse(
      error,
      "Failed to submit game for publication",
      "api/games/[id]/publication#POST",
      { accountId },
    );
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId } = auth;

  try {
    await withdrawPublication(serviceClient(), id, accountId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to withdraw publication",
      "api/games/[id]/publication#DELETE",
      { accountId },
    );
  }
}
