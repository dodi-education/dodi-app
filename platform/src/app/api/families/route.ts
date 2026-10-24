/**
 * POST /api/families — start a new family owned by the signed-in login and
 * switch this session to it. For a login that belongs to no family (removed,
 * or its family was deleted) and for one that wants another family. The
 * client sets up the new family's vault next, as after sign-up.
 */
import { NextResponse } from "next/server";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireLogin } from "@/lib/resolve-auth";
import { createFamily } from "@/services/account-members";

/** Families one login may own; keeps a runaway client from minting accounts. */
const MAX_OWNED_FAMILIES = 5;

export async function POST(request: Request): Promise<Response> {
  const login = await requireLogin(request);
  if (login instanceof Response) return login;
  if (!login.emailVerified) {
    return NextResponse.json({ error: "Confirm your email first" }, { status: 403 });
  }
  try {
    const owned = await serviceDb
      .selectFrom("account_members")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("user_id", "=", login.userId)
      .where("role", "=", "owner")
      .executeTakeFirstOrThrow();
    if (Number(owned.count) >= MAX_OWNED_FAMILIES) {
      return NextResponse.json(
        { error: "You already own the most families allowed", code: "FAMILY_LIMIT" },
        { status: 409 },
      );
    }
    const family = await createFamily(serviceDb, login);
    return NextResponse.json(family, { status: 201 });
  } catch (error) {
    return serverErrorResponse(error, "Failed to start a family", "api/families#POST");
  }
}
