/**
 * GET  /api/account/invitations — the family's open invitations.
 * POST /api/account/invitations — invite another adult. The body carries the
 *      family's VMK sealed under the link secret; the secret itself stays in
 *      the link the inviter sends (never here).
 *
 * Owner and co-parents only.
 */
import { NextResponse } from "next/server";

import { CreateInvitationBodySchema, scopesForRole } from "@dodi/protocol/family-members";

import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  InvitationError,
  createInvitation,
  listPendingInvitations,
} from "@/services/account-invitations";
import { consumeRateLimit } from "@/services/rate-limits";

/** Invitations a family may create per day. */
const INVITE_LIMIT = { bucket: "family_invite", limit: 20, windowMs: 24 * 60 * 60 * 1000 };

export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request, { roles: ["owner", "co_parent"] });
  if (auth instanceof Response) return auth;
  if (auth.via !== "user") {
    return NextResponse.json({ error: "Only a person's login can do this" }, { status: 403 });
  }
  try {
    return NextResponse.json({
      invitations: await listPendingInvitations(serviceDb, auth.accountId),
    });
  } catch (error) {
    return serverErrorResponse(error, "Failed to load invitations", "api/account/invitations#GET", {
      accountId: auth.accountId,
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireAuth(request, { roles: ["owner", "co_parent"] });
  if (auth instanceof Response) return auth;
  if (auth.via !== "user" || !auth.userId) {
    return NextResponse.json({ error: "Only a person's login can do this" }, { status: 403 });
  }
  const parsed = CreateInvitationBodySchema.safeParse(await request.json().catch(() => null));
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
    const attempt = await consumeRateLimit(serviceDb, { accountId: auth.accountId, ...INVITE_LIMIT });
    if (!attempt.allowed) {
      return NextResponse.json({ error: "Too many invitations", code: "RATE_LIMITED" }, { status: 429 });
    }
    const invitation = await createInvitation(serviceDb, {
      accountId: auth.accountId,
      invitedByUserId: auth.userId,
      email: parsed.data.email,
      role: parsed.data.role,
      scopes,
      vmkInviteWrap: parsed.data.vmkInviteWrap,
    });
    return NextResponse.json(invitation, { status: 201 });
  } catch (error) {
    if (error instanceof InvitationError && error.code === "already_member") {
      return NextResponse.json(
        { error: "This person is already in the family", code: "ALREADY_MEMBER" },
        { status: 409 },
      );
    }
    return serverErrorResponse(error, "Failed to invite", "api/account/invitations#POST", {
      accountId: auth.accountId,
    });
  }
}
