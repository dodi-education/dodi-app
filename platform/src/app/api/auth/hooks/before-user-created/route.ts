import { NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";

import { createLogger } from "@/logger";
import { getRegistrationMode, isInviteCodeActive } from "@/services/registration";
import { serviceClient } from "@/lib/supabase";

const log = createLogger("auth-hook");

/**
 * Supabase "Before User Created" auth hook.
 *
 * Called server-to-server by GoTrue immediately before a new user is inserted,
 * for EVERY signup path — so it's the airtight place to enforce the registration
 * mode and validate invite codes while auth otherwise stays owned by Supabase.
 *
 * Requests are signed with Standard Webhooks; the shared secret lives in
 * BEFORE_USER_CREATED_HOOK_SECRET (format "v1,whsec_<base64>"). The invite code
 * arrives in `user.user_metadata.invite_code` (set via signUp options.data).
 *
 * Decision contract: respond HTTP 200 with an empty body to allow, or with
 * `{ error: { http_code, message } }` to reject — GoTrue surfaces `message` to
 * the client. Signature/config failures return a non-2xx so the signup fails
 * closed (we can't trust an unverified caller).
 */

interface BeforeUserCreatedPayload {
  user?: {
    email?: string;
    user_metadata?: Record<string, unknown> | null;
  };
}

function reject(httpCode: number, message: string): NextResponse {
  return NextResponse.json({ error: { http_code: httpCode, message } });
}

function allow(): NextResponse {
  return NextResponse.json({});
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.BEFORE_USER_CREATED_HOOK_SECRET;
  if (!secret) {
    log.error("hook_secret_missing", {});
    return NextResponse.json(
      { error: { http_code: 500, message: "Registration hook is not configured." } },
      { status: 500 },
    );
  }

  const payloadText = await request.text();
  const headers = Object.fromEntries(request.headers);

  let payload: BeforeUserCreatedPayload;
  try {
    // standardwebhooks expects the base64 secret without the "v1,whsec_" prefix.
    const wh = new Webhook(secret.replace(/^v1,whsec_/, ""));
    payload = wh.verify(payloadText, headers) as BeforeUserCreatedPayload;
  } catch (e) {
    log.warn("hook_signature_invalid", { message: (e as Error).message });
    return NextResponse.json(
      { error: { http_code: 401, message: "Invalid hook signature." } },
      { status: 401 },
    );
  }

  const mode = getRegistrationMode();

  if (mode === "closed") {
    log.info("signup_rejected", { reason: "closed" });
    return reject(403, "Registration is currently closed.");
  }

  if (mode === "invite") {
    const rawCode = payload.user?.user_metadata?.["invite_code"];
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    if (!code) {
      log.info("signup_rejected", { reason: "missing_invite_code" });
      return reject(403, "An invite code is required to register.");
    }

    let active: boolean;
    try {
      active = await isInviteCodeActive(serviceClient(), code);
    } catch (e) {
      log.error("invite_check_failed", { message: (e as Error).message });
      return reject(500, "Could not verify the invite code. Please try again.");
    }

    if (!active) {
      log.info("signup_rejected", { reason: "invalid_invite_code" });
      return reject(403, "That invite code is invalid or no longer active.");
    }
  }

  return allow();
}
