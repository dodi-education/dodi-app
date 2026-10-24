/**
 * DELETE /api/account/members/{userId} — take someone out of the family (the
 * owner and co-parents), or leave it (your own id). The owner cannot be
 * removed and cannot leave; deleting the family is DELETE /api/account.
 *
 * PATCH /api/account/members/{userId} — change a non-owner's role and scopes
 * (the owner and co-parents).
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { UpdateMemberBodySchema, scopesForRole } from "@dodi/protocol/family-members";

import { MemberError, removeMember, updateMemberAccess } from "@/services/account-members";

function memberErrorResponse(error: MemberError): NextResponse {
  const status = error.code === "not_found" ? 404 : 403;
  const message =
    error.code === "owner"
      ? "The family's owner cannot be changed or removed"
      : error.code === "forbidden"
        ? "Your role in this family cannot do this"
        : "Not found";
  return NextResponse.json({ error: message, code: error.code }, { status });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const auth = await requireAuth(request, { memberScope: "any" });
  if (auth instanceof Response) return auth;
  if (auth.via !== "user" || !auth.userId || !auth.role) {
    return NextResponse.json({ error: "Only a person's login can do this" }, { status: 403 });
  }
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await removeMember(serviceDb, {
      accountId: auth.accountId,
      actor: { userId: auth.userId, role: auth.role },
      targetUserId: userId,
    });
    return NextResponse.json({ ok: true, isSelf: userId === auth.userId });
  } catch (error) {
    if (error instanceof MemberError) return memberErrorResponse(error);
    return serverErrorResponse(error, "Failed to remove", "api/account/members/[userId]#DELETE", {
      accountId: auth.accountId,
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
): Promise<Response> {
  const auth = await requireAuth(request, { roles: ["owner", "co_parent"] });
  if (auth instanceof Response) return auth;
  if (auth.via !== "user" || !auth.role) {
    return NextResponse.json({ error: "Only a person's login can do this" }, { status: 403 });
  }
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = UpdateMemberBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const scopes = scopesForRole(parsed.data.role, parsed.data.scopes);
  if (!scopes) {
    return NextResponse.json(
      { error: "Choose at least one thing they may do", code: "SCOPES_REQUIRED" },
      { status: 400 },
    );
  }
  try {
    await updateMemberAccess(serviceDb, {
      accountId: auth.accountId,
      actorRole: auth.role,
      targetUserId: userId,
      role: parsed.data.role,
      scopes,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MemberError) return memberErrorResponse(error);
    return serverErrorResponse(error, "Failed to update", "api/account/members/[userId]#PATCH", {
      accountId: auth.accountId,
    });
  }
}
