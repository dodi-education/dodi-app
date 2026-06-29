import { NextResponse } from "next/server";
import { z } from "zod/v4";

import { requireAuth } from "@/lib/resolve-auth";
import {
  getAccount,
  updateAccountDatePreferences,
  updateAccountLanguage,
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

const UpdateAccountSchema = z.object({
  datePreferences: DatePreferencesSchema.optional(),
  // Parent UI language (BCP-47 short code, e.g. "en"/"de").
  language: z.string().min(2).max(5).optional(),
  // `enc:v1:` sealed 4-digit parent PIN; `null` clears it. The server never
  // sees the plaintext PIN.
  parentPinEnc: z.string().min(1).nullable().optional(),
});

/** User-authed: the caller's account (subscription tier, preferences, etc.). */
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

  const { datePreferences, language, parentPinEnc } = result.data;

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
    return NextResponse.json({
      datePreferences: savedDatePreferences,
      language,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update account";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
