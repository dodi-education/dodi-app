import { NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { serviceDb, type Db } from "@/lib/db";
import {
  addFavorite,
  getPlayableGame,
  isGameVisibleToKid,
  removeFavorite,
} from "@/services/games";
import { getKid } from "@/services/kids";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Shared guard: the account must own the kid and the game must be visible to it.
 * Returns an error `NextResponse` to short-circuit, or `null` when authorized.
 */
async function authorizeFavorite(
  db: Db,
  accountId: string,
  gameId: string,
  kidId: string | null,
): Promise<NextResponse | null> {
  if (!kidId) {
    return NextResponse.json({ error: "kidId is required" }, { status: 400 });
  }
  const kid = await getKid(db, kidId);
  if (!kid || kid.account_id !== accountId) {
    return NextResponse.json({ error: "Kid not found" }, { status: 404 });
  }
  // Service-role fallback so a shared published Discover row can be favorited.
  const game = await getPlayableGame(db, serviceDb, gameId);
  if (!game || !(await isGameVisibleToKid(db, game, kidId, accountId))) {
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
  const { accountId, db } = auth;

  const kidId = new URL(request.url).searchParams.get("kidId");
  const denied = await authorizeFavorite(db, accountId, id, kidId);
  if (denied) return denied;

  try {
    await addFavorite(db, { accountId, kidId: kidId!, gameId: id });
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
  const { accountId, db } = auth;

  const kidId = new URL(request.url).searchParams.get("kidId");
  const denied = await authorizeFavorite(db, accountId, id, kidId);
  if (denied) return denied;

  try {
    await removeFavorite(db, { kidId: kidId!, gameId: id });
    return NextResponse.json({ is_favorite: false });
  } catch (error) {
    return serverErrorResponse(error, "Failed to unfavorite game", "api/games/[id]/favorite#DELETE", {
      accountId,
    });
  }
}
