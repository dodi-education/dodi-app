import { NextResponse } from "next/server";

import { CAPTCHA_PROVIDER, getCaptchaConfig } from "@/lib/captcha";

// Evaluate per request against the live env, never at build time.
export const dynamic = "force-dynamic";

/**
 * Public: whether the auth front doors require a captcha token, and the public
 * site key the browser needs to render the Turnstile widget. Keeping the site
 * key here (instead of a NEXT_PUBLIC_* build arg in the web image) makes the
 * platform the single place bot protection is switched on, so the client and
 * server can never disagree about it.
 */
export async function GET(): Promise<Response> {
  const config = getCaptchaConfig();
  return NextResponse.json(
    config
      ? { provider: CAPTCHA_PROVIDER, siteKey: config.siteKey }
      : { provider: null },
    { headers: { "cache-control": "no-store" } },
  );
}
