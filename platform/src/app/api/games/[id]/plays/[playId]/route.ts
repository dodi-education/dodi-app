import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import { getPlay, updatePlay } from "@/services/game-plays";
import { MetricsSummarySchema } from "@dodi/games/success";

const UpdatePlaySchema = z.object({
  finalProgress: z.number().min(0).max(1).optional(),
  metrics: MetricsSummarySchema.optional(),
  succeeded: z.boolean().optional(),
  ended: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string; playId: string }>;
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { playId } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = UpdatePlaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const play = await getPlay(supabase, playId);
    if (!play || play.account_id !== accountId) {
      return NextResponse.json({ error: "Play not found" }, { status: 404 });
    }

    const updated = await updatePlay(supabase, playId, {
      finalProgress: parsed.data.finalProgress,
      metrics: parsed.data.metrics,
      succeeded: parsed.data.succeeded,
      ended: parsed.data.ended,
    });

    return NextResponse.json(
      { succeeded: updated.succeeded, finalProgress: updated.final_progress },
      { status: 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update play";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
