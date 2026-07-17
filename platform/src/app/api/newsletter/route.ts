import { NextResponse } from "next/server";
import { createElement } from "react";
import { z } from "zod/v4";

import { clientIp, hashIp } from "@/lib/client-ip";
import { sendEmail } from "@/lib/email";
import { serverErrorResponse } from "@/lib/error-logs";
import { serviceClient } from "@/lib/supabase";
import { NewsletterWelcomeEmail } from "@/emails/newsletter-welcome";
import { newsletterWelcomeCopy } from "@/emails/strings";
import {
  isValidNewsletterList,
  recordNewsletterSignup,
} from "@/services/newsletter";

// Public endpoint hit by the static marketing site (dodi.app) cross-origin.
// CORS + OPTIONS preflight are handled generically in middleware.ts.
export const dynamic = "force-dynamic";

/** Per-IP cap within the rolling window (enforced inside the RPC). */
const MAX_PER_IP = 5;
const RATE_WINDOW = "01:00:00";
/**
 * Minimum ms between the form mounting and submit. `elapsedMs` is measured
 * entirely client-side (Date.now() at mount vs. submit) to dodge client/server
 * clock skew. The form mounts at page load and sits near the bottom of the
 * page, so a real visitor takes many seconds to reach and fill it — anything
 * faster (or a direct API POST with no field) is almost certainly a bot.
 */
const MIN_FILL_MS = 2500;

const BodySchema = z.object({
  email: z.string().trim().email().max(320),
  locale: z.enum(["en", "de"]).catch("en"),
  // Which newsletter list — validated against NEWSLETTER_LISTS below.
  list: z.string().trim().min(1).max(64),
  // Honeypot — validated in the handler, not the schema (a 400 would reveal it).
  hp: z.string().optional(),
  // Client-measured ms since the form mounted (timing trap).
  elapsedMs: z.number().optional(),
});

/** Join a newsletter list (single opt-in). */
export async function POST(request: Request): Promise<NextResponse> {
  const body: unknown = await request.json().catch(() => null);
  const result = BodySchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: result.error.issues },
      { status: 400 },
    );
  }
  const { email, locale, list, hp, elapsedMs } = result.data;

  // Spam gate — honeypot: a hidden field no human sees. Non-empty ⇒ bot.
  // Respond 200 so the bot can't tell it was caught.
  if (hp && hp.trim() !== "") {
    return NextResponse.json({ ok: true });
  }
  // Spam gate — timing trap: too fast (or no timing at all) ⇒ scripted. Silent 200.
  if (
    typeof elapsedMs !== "number" ||
    !Number.isFinite(elapsedMs) ||
    elapsedMs < MIN_FILL_MS
  ) {
    return NextResponse.json({ ok: true });
  }

  // Reject unknown lists (misconfigured form or tampering) before touching the DB.
  if (!isValidNewsletterList(list)) {
    return NextResponse.json({ error: "Unknown list" }, { status: 400 });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const ipHash = hashIp(clientIp(request));

  let outcome;
  try {
    outcome = await recordNewsletterSignup(serviceClient(), {
      email: normalizedEmail,
      locale,
      list,
      ipHash,
      maxPerIp: MAX_PER_IP,
      window: RATE_WINDOW,
    });
  } catch (error) {
    return serverErrorResponse(
      error,
      "Failed to record signup",
      "api/newsletter#POST",
    );
  }

  if (outcome.rateLimited) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // New signup → per-list welcome email (best-effort; sendEmail never throws and
  // skips when RESEND_API_KEY is unset, so the signup is stored either way).
  // Awaited so the serverless function stays alive until Resend accepts it.
  if (outcome.isNew && list === "newsletter") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app";
    await sendEmail({
      to: normalizedEmail,
      subject: newsletterWelcomeCopy(locale).subject,
      react: createElement(NewsletterWelcomeEmail, { appUrl, locale }),
    });
  }

  return NextResponse.json({ ok: true });
}
