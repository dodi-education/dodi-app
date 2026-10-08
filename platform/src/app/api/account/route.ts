import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { verifySessionPassword } from "@/lib/auth";
import { serviceDb } from "@/lib/db";
import { serverErrorResponse } from "@/lib/error-logs";
import { triggerLandingRebuild } from "@/lib/landing-rebuild";
import { requireAuth } from "@/lib/resolve-auth";
import { deleteAccount } from "@/services/account-deletion";
import {
  getAccount,
  updateAccountDatePreferences,
  updateAccountGameScreenshotService,
  updateAccountInterfacePreferences,
  updateAccountLanguage,
  updateAccountNotificationPreferences,
  updateAccountParentPin,
} from "@/services/accounts";
import { consumeRateLimit } from "@/services/rate-limits";
import { GameScreenshotServiceSettingsSchema } from "@dodi/games/screenshot-contract";
import { DATE_STYLE_IDS } from "@dodi/intl";

/** Update payload for date/time display preferences. */
const DatePreferencesSchema = z.object({
  dateStyle: z.enum(DATE_STYLE_IDS).optional(),
  timeStyle: z.enum(["24h", "12h", "none"]).optional(),
  // `enc:v1:` sealed IANA timezone; `null` clears it (⇒ automatic). The server
  // never sees the plaintext zone.
  timeZoneEnc: z.string().min(1).nullable().optional(),
});

/** Plaintext (opt-out) notification toggles; the server reads these to decide
 *  whether to send transactional email. Partial ⇒ merged server-side. */
const NotificationPreferencesSchema = z
  .object({
    friend_approval_email: z.boolean(),
    publication_outcome_email: z.boolean(),
  })
  .partial();

/** Plaintext (opt-out) interface toggles. Partial ⇒ merged server-side. */
const InterfacePreferencesSchema = z
  .object({
    is_3d_enabled: z.boolean(),
  })
  .partial();

const UpdateAccountSchema = z.object({
  datePreferences: DatePreferencesSchema.optional(),
  // Parent UI language (BCP-47 short code, e.g. "en"/"de").
  language: z.string().min(2).max(5).optional(),
  // `enc:v1:` sealed 4-digit parent PIN; `null` clears it. The server never
  // sees the plaintext PIN.
  parentPinEnc: z.string().min(1).nullable().optional(),
  notificationPreferences: NotificationPreferencesSchema.optional(),
  // Game Studio screenshot service: plaintext mode + an `enc:v1:` sealed custom
  // URL. The server validates only the envelope; it never sees the URL.
  gameScreenshotService: GameScreenshotServiceSettingsSchema.optional(),
  interfacePreferences: InterfacePreferencesSchema.optional(),
});

/** User-authed: the caller's account (subscribed plan, entitlements, preferences). */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const account = await getAccount(auth.db, auth.accountId);
  return NextResponse.json({ account });
}

/** User-authed: update account-level preferences (date/time display, UI language, interface). */
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, db } = auth;

  const body: unknown = await request.json();
  const result = UpdateAccountSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  const {
    datePreferences,
    language,
    parentPinEnc,
    notificationPreferences,
    gameScreenshotService,
    interfacePreferences,
  } = result.data;

  try {
    const savedDatePreferences = datePreferences
      ? await updateAccountDatePreferences(db, accountId, datePreferences)
      : undefined;
    if (language !== undefined) {
      await updateAccountLanguage(db, accountId, language);
    }
    if (parentPinEnc !== undefined) {
      await updateAccountParentPin(db, accountId, parentPinEnc);
    }
    const savedNotificationPreferences = notificationPreferences
      ? await updateAccountNotificationPreferences(
          db,
          accountId,
          notificationPreferences,
        )
      : undefined;
    const savedGameScreenshotService = gameScreenshotService
      ? await updateAccountGameScreenshotService(db, accountId, gameScreenshotService)
      : undefined;
    const savedInterfacePreferences = interfacePreferences
      ? await updateAccountInterfacePreferences(db, accountId, interfacePreferences)
      : undefined;
    return NextResponse.json({
      datePreferences: savedDatePreferences,
      language,
      notificationPreferences: savedNotificationPreferences,
      gameScreenshotService: savedGameScreenshotService,
      interfacePreferences: savedInterfacePreferences,
    });
  } catch (error) {
    return serverErrorResponse(error, "Failed to update account", "api/account#PATCH", {
      accountId,
    });
  }
}

/** Re-authentication for DELETE: the account password, checked server-side. */
const DeleteAccountSchema = z.object({
  password: z.string().min(1).max(1024),
});

/** Password attempts per account before DELETE answers 429 (in-process checks skip Better Auth's limit). */
const DELETE_ATTEMPT_LIMIT = { bucket: "account_delete", limit: 5, windowMs: 15 * 60 * 1000 };

/**
 * User-authed: permanently delete the caller's account and all family data
 * (see services/account-deletion). Requires the account password, and only a
 * signed-in parent session can do it: device tokens (headless agents) cannot.
 * Every session ends with the account, so clients sign out locally afterwards.
 */
export async function DELETE(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, via } = auth;
  if (via !== "user") {
    return NextResponse.json(
      { error: "Only a signed-in parent can delete the account" },
      { status: 403 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const result = DeleteAccountSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  try {
    const attempt = await consumeRateLimit(serviceDb, { accountId, ...DELETE_ATTEMPT_LIMIT });
    if (!attempt.allowed) {
      const retryAfter = Math.max(1, Math.ceil((attempt.resetAt.getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Too many attempts", code: "RATE_LIMITED" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    if (!(await verifySessionPassword(request.headers, result.data.password))) {
      return NextResponse.json(
        { error: "Wrong password", code: "WRONG_PASSWORD" },
        { status: 403 },
      );
    }

    const deleted = await deleteAccount(serviceDb, accountId);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // A live game left the public catalogue: the marketing site lists it.
    if (deleted.hadLivePublications) await triggerLandingRebuild();
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverErrorResponse(error, "Failed to delete account", "api/account#DELETE", {
      accountId,
      expose: false,
    });
  }
}
