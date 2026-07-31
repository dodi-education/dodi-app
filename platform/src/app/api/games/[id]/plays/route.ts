import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceClient } from "@/lib/supabase";
import { getPlayableGame, isGameVisibleToKid } from "@/services/games";
import { getKid } from "@/services/kids";
import { isPlausiblePlayTimestamp } from "@/lib/play-timestamps";
import { getPlay, startPlay } from "@/services/game-plays";
import type { ProgressKind } from "@dodi/types/success";

const StartPlaySchema = z.object({
  kidId: z.string().uuid(),
  // Offline sync: the client generates the play id (idempotency key) and
  // supplies the real start time; both optional for the plain online path.
  playId: z.string().uuid().optional(),
  startedAt: z.iso.datetime({ offset: true }).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;

  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const parsed = StartPlaySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { kidId, playId, startedAt } = parsed.data;

  // A late-synced start time must be plausible: not from the future, not
  // ancient (bounds clock skew and replayed backlogs).
  if (startedAt && !isPlausiblePlayTimestamp(startedAt)) {
    return NextResponse.json(
      { error: "startedAt out of range" },
      { status: 400 },
    );
  }

  try {
    const kid = await getKid(supabase, kidId);
    if (!kid || kid.account_id !== accountId) {
      return NextResponse.json({ error: "Kid not found" }, { status: 404 });
    }

    // Published Discover rows belong to other accounts (RLS-hidden), hence the
    // service-role fallback; the play row itself is written with THIS family's
    // ids, so plays on a published game aggregate on its single row.
    const game = await getPlayableGame(supabase, serviceClient(), id);
    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    // Inactive / unshared games are not playable outside the parent studio.
    if (!(await isGameVisibleToKid(supabase, game, kid.id, accountId))) {
      return NextResponse.json({ error: "Game not available" }, { status: 403 });
    }

    // Idempotent replay: the outbox may re-POST an id whose first attempt was
    // acked but not recorded client-side. Same account + game + kid → the
    // existing row is the answer. A foreign id (another account's row, or a
    // UUID collision) is a conflict — the id space makes probing useless.
    if (playId) {
      const existing = await getPlay(supabase, playId);
      if (existing) {
        const isOwnReplay =
          existing.account_id === accountId &&
          existing.game_id === game.id &&
          existing.kid_id === kid.id;
        return isOwnReplay
          ? NextResponse.json({ playId: existing.id }, { status: 200 })
          : NextResponse.json({ error: "Conflict" }, { status: 409 });
      }
    }

    const play = await startPlay(supabase, {
      accountId: accountId,
      kidId: kid.id,
      gameId: game.id,
      progressKind: game.progress_kind as ProgressKind,
      playId,
      startedAt,
    });

    return NextResponse.json({ playId: play.id }, { status: 201 });
  } catch (error) {
    // A pkey violation here means the id exists on a row RLS hides from this
    // account (the own-row replay already returned 200 above) — a conflict,
    // not a server error.
    if (playId && (error as { code?: string }).code === "23505") {
      return NextResponse.json({ error: "Conflict" }, { status: 409 });
    }
    return serverErrorResponse(error, "Failed to start play", "api/games/[id]/plays#POST", {
      accountId,
    });
  }
}
