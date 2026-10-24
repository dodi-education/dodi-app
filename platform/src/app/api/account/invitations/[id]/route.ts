/** DELETE /api/account/invitations/{id} — cancel an invitation; its link stops working. */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import { revokeInvitation } from "@/services/account-invitations";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuth(request, { roles: ["owner", "co_parent"] });
  if (auth instanceof Response) return auth;
  if (auth.via !== "user") {
    return NextResponse.json({ error: "Only a person's login can do this" }, { status: 403 });
  }
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const revoked = await revokeInvitation(serviceDb, auth.accountId, id);
    if (!revoked) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverErrorResponse(error, "Failed to cancel", "api/account/invitations/[id]#DELETE", {
      accountId: auth.accountId,
    });
  }
}
