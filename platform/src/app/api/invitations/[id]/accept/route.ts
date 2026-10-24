/**
 * POST /api/invitations/{id}/accept — join the family. The invited login sends
 * the family's VMK wrapped to its personal key (and that key, when it has
 * none yet). The membership is recorded, the invitation's sealed copy erased,
 * and this session switched to the family.
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { AcceptInvitationBodySchema } from "@dodi/protocol/family-members";
import type { StoredUserKeys } from "@dodi/vault";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { invitationErrorResponse } from "@/lib/invitation-errors";
import { requireLogin } from "@/lib/resolve-auth";
import { acceptInvitation } from "@/services/account-invitations";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const login = await requireLogin(request);
  if (login instanceof Response) return login;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = AcceptInvitationBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  try {
    const joined = await acceptInvitation(serviceDb, {
      id,
      login,
      sessionId: login.sessionId,
      userKeys: parsed.data.userKeys as StoredUserKeys | undefined,
      memberVmkWrap: parsed.data.memberVmkWrap,
    });
    return NextResponse.json(joined);
  } catch (error) {
    return (
      invitationErrorResponse(error) ??
      serverErrorResponse(error, "Failed to join", "api/invitations/[id]/accept#POST")
    );
  }
}
