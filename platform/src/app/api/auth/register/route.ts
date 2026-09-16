import { NextResponse } from "next/server";

import { APIError } from "better-auth/api";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { getCaptchaConfig, verifyCaptchaRequest } from "@/lib/captcha";

/**
 * Sign-up front door. Every well-formed request gets the same `{ ok: true }`
 * whether or not the email is already registered (Better Auth answers an
 * existing address with a synthetic success when email verification is
 * required; this route additionally masks the 422 it returns in other
 * configurations), so sign-up cannot be used to probe for accounts. Only a
 * genuinely new address receives a code.
 *
 * Registration-mode and invite-code failures (400, codes REGISTRATION_CLOSED,
 * INVITE_CODE_REQUIRED, INVITE_CODE_INVALID) are real user errors and are
 * surfaced as-is; they never reveal whether the email exists.
 *
 * When Turnstile is configured the request must carry a valid
 * `x-captcha-response` token (400 MISSING_RESPONSE / 403 VERIFICATION_FAILED).
 * The check lives here because `auth.api.signUpEmail` runs in-process, where
 * Better Auth's captcha plugin (an HTTP-handler hook) never sees the request.
 */
const BodySchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  inviteCode: z.string().trim().max(64).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const captcha = getCaptchaConfig();
  if (captcha) {
    const verdict = await verifyCaptchaRequest(request, captcha);
    if (!verdict.ok) {
      return NextResponse.json(
        { error: verdict.message, code: verdict.code },
        { status: verdict.status },
      );
    }
  }

  try {
    await auth.api.signUpEmail({
      body: {
        email: body.email,
        password: body.password,
        name: body.email,
        inviteCode: body.inviteCode ?? null,
      },
      headers: request.headers,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof APIError) {
      const code = (error.body as { code?: string } | undefined)?.code;
      if (code === "USER_ALREADY_EXISTS") {
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json(
        { error: error.body?.message ?? error.message },
        { status: error.statusCode },
      );
    }
    throw error;
  }
}
