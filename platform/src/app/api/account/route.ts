import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { serverErrorResponse } from "@/lib/error-logs";
import { requireAuth } from "@/lib/resolve-auth";
import {
  getAccount,
  updateAccountDatePreferences,
  updateAccountLanguage,
  updateAccountNotificationPreferences,
  updateAccountParentPin,
} from "@/services/accounts";
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

const UpdateAccountSchema = z.object({
  datePreferences: DatePreferencesSchema.optional(),
  // Parent UI language (BCP-47 short code, e.g. "en"/"de").
  language: z.string().min(2).max(5).optional(),
  // `enc:v1:` sealed 4-digit parent PIN; `null` clears it. The server never
  // sees the plaintext PIN.
  parentPinEnc: z.string().min(1).nullable().optional(),
  notificationPreferences: NotificationPreferencesSchema.optional(),
});

/** User-authed: the caller's account (subscribed plan, entitlements, preferences). */
export async function GET(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const account = await getAccount(auth.supabase, auth.accountId);
  return NextResponse.json({ account });
}

/** User-authed: update account-level preferences (date/time display, UI language). */
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireAuth(request);
  if (auth instanceof Response) return auth;
  const { accountId, supabase } = auth;

  const body: unknown = await request.json();
  const result = UpdateAccountSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }

  const { datePreferences, language, parentPinEnc, notificationPreferences } =
    result.data;

  try {
    const savedDatePreferences = datePreferences
      ? await updateAccountDatePreferences(supabase, accountId, datePreferences)
      : undefined;
    if (language !== undefined) {
      await updateAccountLanguage(supabase, accountId, language);
    }
    if (parentPinEnc !== undefined) {
      await updateAccountParentPin(supabase, accountId, parentPinEnc);
    }
    const savedNotificationPreferences = notificationPreferences
      ? await updateAccountNotificationPreferences(
          supabase,
          accountId,
          notificationPreferences,
        )
      : undefined;
    return NextResponse.json({
      datePreferences: savedDatePreferences,
      language,
      notificationPreferences: savedNotificationPreferences,
    });
  } catch (error) {
    return serverErrorResponse(error, "Failed to update account", "api/account#PATCH", {
      accountId,
    });
  }
}
