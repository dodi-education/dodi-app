import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@dodi/types/database";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  addFavorite,
  getGame,
  isGameVisibleToKid,
  removeFavorite,
} from "@/services/games";
import { getKid } from "@/services/kids";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type Client = SupabaseClient<Database>;

/**
 * Shared guard: the account must own the kid and the game must be visible to it.
 * Returns an error `NextResponse` to short-circuit, or `null` when authorized.
 */
async function authorizeFavorite(
  supabase: Client,
  accountId: string,
  gameId: string,
  kidId: string | null,
): Promise<NextResponse | null> {
  if (!kidId) {
    return NextResponse.json({ error: "kidId is required" }, { status: 400 });
  }
  const kid = await getKid(supabase, kidId);
  if (!kid || kid.account_id !== accountId) {
    return NextResponse.json({ error: "Kid not found" }, { status: 404 });
  }
  const game = await getGame(supabase, gameId);
  if (!game || !(await isGameVisibleToKid(supabase, game, kidId))) {
    return NextResponse.json({ error: "Game not found" }, { status: 404 });
  }
  return null;
}

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const kidId = new URL(request.url).searchParams.get("kidId");
  const denied = await authorizeFavorite(supabase, accountId, id, kidId);
  if (denied) return denied;

  try {
    await addFavorite(supabase, { accountId, kidId: kidId!, gameId: id });
    return NextResponse.json({ is_favorite: true });
  } catch (error) {
    return serverErrorResponse(error, "Failed to favorite game", "api/games/[id]/favorite#PUT", {
      accountId,
    });
  }
}

export async function DELETE(
  request: Request,
  context: RouteContext,
): Promise<NextResponse> {
  const { id } = await context.params;
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const kidId = new URL(request.url).searchParams.get("kidId");
  const denied = await authorizeFavorite(supabase, accountId, id, kidId);
  if (denied) return denied;

  try {
    await removeFavorite(supabase, { kidId: kidId!, gameId: id });
    return NextResponse.json({ is_favorite: false });
  } catch (error) {
    return serverErrorResponse(error, "Failed to unfavorite game", "api/games/[id]/favorite#DELETE", {
      accountId,
    });
  }
}
