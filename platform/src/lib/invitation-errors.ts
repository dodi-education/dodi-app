import { NextResponse } from "next/server";

import { InvitationError } from "@/services/account-invitations";

const STATUS: Record<InvitationError["code"], number> = {
  not_found: 404,
  not_pending: 410,
  expired: 410,
  wrong_email: 403,
  already_member: 409,
  keys_required: 400,
  no_vault: 409,
};

const MESSAGE: Record<InvitationError["code"], string> = {
  not_found: "This invitation does not exist",
  not_pending: "This invitation was already used or cancelled",
  expired: "This invitation has expired",
  wrong_email: "This invitation is for another email address",
  already_member: "You are already in this family",
  keys_required: "Your keys are missing",
  no_vault: "This family has no vault yet",
};

/** An InvitationError as its JSON answer (`code` for the client's copy); null otherwise. */
export function invitationErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof InvitationError)) return null;
  return NextResponse.json(
    { error: MESSAGE[error.code], code: error.code.toUpperCase() },
    { status: STATUS[error.code] },
  );
}
