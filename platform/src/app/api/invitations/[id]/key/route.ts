/**
 * GET /api/invitations/{id}/key — the family's VMK sealed under the link's
 * secret, and the family's check value to verify it. Only for the invited
 * login: signed in with the invited address, verified.
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { invitationErrorResponse } from "@/lib/invitation-errors";
import { requireLogin } from "@/lib/resolve-auth";
import { getInvitationKey } from "@/services/account-invitations";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const login = await requireLogin(request);
  if (login instanceof Response) return login;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    return NextResponse.json(await getInvitationKey(serviceDb, id, login));
  } catch (error) {
    return (
      invitationErrorResponse(error) ??
      serverErrorResponse(error, "Failed to load the invitation", "api/invitations/[id]/key#GET")
    );
  }
}
