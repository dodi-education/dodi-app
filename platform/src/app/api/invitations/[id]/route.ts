/**
 * GET /api/invitations/{id} — what the join page shows before anyone signs
 * in: the invited address, the role, who invited, whether the link still
 * works. Public: the id is a random UUID that only the link carries. Nothing
 * here can open the family's data (the sealed key needs the invited login,
 * and the secret is in the link only).
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { getInvitationPreview } from "@/services/account-invitations";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const invitation = await getInvitationPreview(serviceDb, id);
    if (!invitation) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ invitation });
  } catch (error) {
    return serverErrorResponse(error, "Failed to load the invitation", "api/invitations/[id]#GET");
  }
}
