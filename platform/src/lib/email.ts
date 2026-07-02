/**
 * Transactional email transport (Resend). This is the single place the platform
 * sends app-level email from; the same RESEND_API_KEY that backs Supabase custom
 * SMTP is reused here for the SDK. Templates live in `src/emails`.
 *
 * Sends never throw: callers fire-and-forget (email delivery must not affect the
 * request that triggered it), so failures are logged and surfaced as a boolean.
 */
import type { ReactElement } from "react";
import { Resend } from "resend";

// Must be a Resend-verified sender (see docs/auth-setup.md). Overridable per
// env: prod verifies mail.dodi.app, dev verifies dev-mail.dodi.app (set
// EMAIL_FROM accordingly — the apex dodi.app is NOT verified on Resend).
const FROM = process.env.EMAIL_FROM ?? "dodi <team@mail.dodi.app>";

let client: Resend | null = null;

/** Lazily build one Resend client. Returns null when the key is unset. */
function getResend(): Resend | null {
  if (client) return client;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  client = new Resend(key);
  return client;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** A React Email element (see `src/emails`); Resend renders it to HTML. */
  react: ReactElement;
}

/** Send one email. Returns true on success, false on any failure (never throws). */
export async function sendEmail({
  to,
  subject,
  react,
}: SendEmailInput): Promise<boolean> {
  const resend = getResend();
  if (!resend) {
    console.warn(
      `[email] RESEND_API_KEY is not set — skipping "${subject}" to ${to}`,
    );
    return false;
  }
  try {
    const { error } = await resend.emails.send({ from: FROM, to, subject, react });
    if (error) {
      console.error(`[email] Resend rejected "${subject}" to ${to}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[email] Failed to send "${subject}" to ${to}:`, err);
    return false;
  }
}
