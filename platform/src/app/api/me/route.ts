/**
 * DELETE /api/me — permanently delete the signed-in person's profile (their
 * login, personal key, settings and memberships). Works with or without an
 * active account, so a person whose account was deleted can still remove
 * themselves. Refused with 409 OWNS_ACCOUNT while the profile owns an account:
 * the owner deletes the account first (DELETE /api/account).
 */
import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { verifySessionPassword } from "@/lib/auth";
import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { requireLogin } from "@/lib/resolve-auth";
import { LoginDeletionError, deleteLogin } from "@/services/account-deletion";
import { firstAccountOf } from "@/services/account-members";
import { consumeRateLimit } from "@/services/rate-limits";

/** Re-authentication: the profile's password, checked server-side. */
const DeleteProfileSchema = z.object({
  password: z.string().min(1).max(1024),
});

/**
 * Password attempts before DELETE answers 429 (the in-process check skips
 * Better Auth's limiter). Counted against the person's first account; a
 * profile in no account has no data left to protect and is not limited.
 */
const DELETE_ATTEMPT_LIMIT = { bucket: "profile_delete", limit: 5, windowMs: 15 * 60 * 1000 };

export async function DELETE(request: Request): Promise<Response> {
  const login = await requireLogin(request);
  if (login instanceof Response) return login;

  const body: unknown = await request.json().catch(() => null);
  const result = DeleteProfileSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const accountId = await firstAccountOf(serviceDb, login.userId);
    if (accountId) {
      const attempt = await consumeRateLimit(serviceDb, { accountId, ...DELETE_ATTEMPT_LIMIT });
      if (!attempt.allowed) {
        const retryAfter = Math.max(1, Math.ceil((attempt.resetAt.getTime() - Date.now()) / 1000));
        return NextResponse.json(
          { error: "Too many attempts", code: "RATE_LIMITED" },
          { status: 429, headers: { "Retry-After": String(retryAfter) } },
        );
      }
    }

    if (!(await verifySessionPassword(request.headers, result.data.password))) {
      return NextResponse.json(
        { error: "Wrong password", code: "WRONG_PASSWORD" },
        { status: 403 },
      );
    }

    const isDeleted = await deleteLogin(serviceDb, login.userId);
    if (!isDeleted) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof LoginDeletionError) {
      return NextResponse.json(
        { error: "You still own an account; delete it first", code: "OWNS_ACCOUNT" },
        { status: 409 },
      );
    }
    return serverErrorResponse(error, "Failed to delete profile", "api/me#DELETE", {
      expose: false,
    });
  }
}
