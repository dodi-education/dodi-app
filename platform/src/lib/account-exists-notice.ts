/**
 * Registered addresses never receive a confirm code from the sign-up flow.
 *
 * /api/auth/register answers `{ ok: true }` for new and registered addresses
 * alike (no account enumeration). Before this notice existed, a registered
 * address then received nothing at all, and the register page's "Resend code"
 * (send-verification-otp, type email-verification) DID email a confirm code to
 * it; entering that code auto-signed the visitor in to the EXISTING account,
 * and the register page went on to store a brand-new vault on it.
 *
 * Now both paths send the owner the same notice instead: "you already have an
 * account, sign in or reset your password". The HTTP answers stay identical to
 * the new-address case, so nothing leaks to whoever filled in the form.
 */
import { createElement } from "react";

import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";

import { AccountExistsEmail } from "@/emails/account-exists";
import { accountExistsCopy, normalizeEmailLocale } from "@/emails/strings";
import { serviceDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { logServerError } from "@/lib/error-logs";
import { consumeRateLimit } from "@/services/rate-limits";

/**
 * Per account: the form (and its resend button) can be submitted for someone
 * else's address, so the notice must not become a way to flood an inbox.
 */
export const ACCOUNT_EXISTS_NOTICE_LIMIT = {
  bucket: "account_exists_notice",
  limit: 3,
  windowMs: 60 * 60 * 1000,
};

/**
 * Email the owner of a registered address that someone tried to sign up with
 * it. Never throws: the caller's response must not differ from the new-address
 * case, so failures are only logged.
 */
export async function sendAccountExistsNotice(user: { id: string; email: string }): Promise<void> {
  try {
    const { allowed } = await consumeRateLimit(serviceDb, {
      accountId: user.id,
      ...ACCOUNT_EXISTS_NOTICE_LIMIT,
    });
    if (!allowed) return;
    const account = await serviceDb
      .selectFrom("accounts")
      .select("language")
      .where("id", "=", user.id)
      .executeTakeFirst();
    const locale = normalizeEmailLocale(account?.language);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app";
    // sendEmail logs a failed delivery itself and never throws.
    await sendEmail({
      to: user.email,
      subject: accountExistsCopy(locale).subject,
      react: createElement(AccountExistsEmail, { locale, appUrl }),
    });
  } catch (error) {
    logServerError("auth#account-exists-notice", error, { accountId: user.id });
  }
}

/**
 * A confirm code is only for an address that is not confirmed yet. For a
 * verified account, send-verification-otp with type email-verification creates
 * no code: it sends the notice and answers `{ success: true }` exactly like the
 * normal path. Unverified accounts (the sign-in page finishing a confirmation)
 * and the other OTP types are untouched.
 *
 * Captcha and rate limiting run in the router's onRequest, before any hook, so
 * this short-circuit does not bypass them.
 */
export function verifiedAccountOtpGuard() {
  return {
    id: "verified-account-otp-guard",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === "/email-otp/send-verification-otp",
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { email?: unknown; type?: unknown } | undefined;
            if (body?.type !== "email-verification" || typeof body.email !== "string") return;
            const found = await ctx.context.internalAdapter.findUserByEmail(body.email);
            if (!found?.user.emailVerified) return;
            await sendAccountExistsNotice(found.user);
            return ctx.json({ success: true });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
