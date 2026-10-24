import { createElement } from "react";

// The inferred type of `auth` reaches into zod's internals through the plugin
// endpoints; this type-only import lets TypeScript name them (TS2742).
import type {} from "zod/v4/core";

import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { bearer, captcha, emailOTP } from "better-auth/plugins";

import { AuthCodeEmail, type AuthCodeKind } from "@/emails/auth-code";
import { authCodeCopy, normalizeEmailLocale } from "@/emails/strings";
import {
  CAPTCHA_PROTECTED_AUTH_PATHS,
  CAPTCHA_PROVIDER,
  getCaptchaConfig,
} from "@/lib/captcha";
import {
  sendAccountExistsNotice,
  verifiedAccountOtpGuard,
} from "@/lib/account-exists-notice";
import { serviceDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { isInvitationOpenFor } from "@/services/account-invitations";
import {
  getRegistrationMode,
  isInviteCodeActive,
} from "@/services/registration";

import { passwordOps } from "./auth-password-plugin";
import { AUTH_RATE_LIMIT } from "./auth-rate-limit";

/**
 * Authentication for platform.dodi.app: Better Auth (MIT, self-hosted), tables
 * `auth_*` in the platform database, sessions are DB rows. Clients are
 * bearer-only (no cross-origin cookies): the web app stores the token the
 * bearer plugin hands out in `set-auth-token` and sends it as
 * `Authorization: Bearer …` to the platform and to ai.dodi.app, which verifies
 * it against `GET /api/auth/get-session` here.
 *
 * Account provisioning stays in SQL: `handle_new_user()` fires on
 * `auth_users` insert and creates `public.accounts` with the owner membership
 * (+ records the invite redemption), atomically with the user row; a login
 * signing up from a family invitation gets no family of its own. This module
 * only gates the insert (REGISTRATION_MODE / invite code / family invitation)
 * and sends the one-time codes.
 *
 * Everything outside this file talks to auth through `resolveAuth` and the
 * routes under /api/auth, so the library stays swappable (later: npub login).
 */

const ONE_DAY = 60 * 60 * 24;

/** Origins allowed to call the auth endpoints; same list as the CORS middleware. */
export function allowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

interface UserCreateInput {
  email: string;
  inviteCode?: string | null;
  familyInvitationId?: string | null;
}

/**
 * Before a user row is inserted: apply the registration gate that used to be
 * the GoTrue before-user-created webhook. Throwing rejects the sign-up.
 * Status 400 on purpose: Better Auth turns a 403 raised during user creation
 * into its generic "duplicate email" success response, which would hide these
 * errors from the parent.
 */
async function registrationGate<T extends UserCreateInput>(user: T): Promise<{ data: T }> {
  // Invited into a family: the invitation is the admission, whatever the mode.
  if (user.familyInvitationId) {
    const isOpen = await isInvitationOpenFor(serviceDb, user.familyInvitationId, user.email);
    if (!isOpen) {
      throw new APIError("BAD_REQUEST", {
        code: "INVITATION_INVALID",
        message: "This invitation is no longer valid for this email address.",
      });
    }
    return { data: { ...user, inviteCode: null } };
  }
  const mode = getRegistrationMode();
  if (mode === "closed") {
    throw new APIError("BAD_REQUEST", {
      code: "REGISTRATION_CLOSED",
      message: "Registration is currently closed.",
    });
  }
  if (mode === "invite") {
    const code = user.inviteCode?.trim() ?? "";
    if (!code) {
      throw new APIError("BAD_REQUEST", {
        code: "INVITE_CODE_REQUIRED",
        message: "An invite code is required to register.",
      });
    }
    const active = await isInviteCodeActive(serviceDb, code);
    if (!active) {
      throw new APIError("BAD_REQUEST", {
        code: "INVITE_CODE_INVALID",
        message: "That invite code is invalid or no longer active.",
      });
    }
    return { data: { ...user, inviteCode: code } };
  }
  return { data: { ...user, inviteCode: null } };
}

const OTP_KIND: Record<string, AuthCodeKind> = {
  "email-verification": "confirm",
  "forget-password": "reset",
  "sign-in": "sign-in",
};

/** Deliver a one-time code. Throws so Better Auth reports delivery failures. */
async function sendVerificationOTP(input: {
  email: string;
  otp: string;
  type: string;
}): Promise<void> {
  const kind = OTP_KIND[input.type] ?? "sign-in";
  const user = await serviceDb
    .selectFrom("auth_users as u")
    .leftJoin("user_settings as s", "s.user_id", "u.id")
    .select("s.language")
    .where("u.email", "=", input.email)
    .executeTakeFirst();
  const locale = normalizeEmailLocale(user?.language);
  const copy = authCodeCopy(locale)[kind];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.dodi.app";
  const sent = await sendEmail({
    to: input.email,
    subject: copy.subject,
    react: createElement(AuthCodeEmail, { code: input.otp, kind, locale, appUrl }),
  });
  if (!sent) {
    throw new APIError("INTERNAL_SERVER_ERROR", {
      message: "Could not send the verification code. Please try again.",
    });
  }
}

/**
 * Turnstile on the auth front doors, only when the platform is configured for
 * it (see lib/captcha). The plugin hooks the HTTP handler: it demands a valid
 * `x-captcha-response` header on the listed paths and answers 400/403 itself.
 * In-process `auth.api.*` calls bypass it, so /api/auth/register verifies on
 * its own before calling `signUpEmail`.
 */
const captchaConfig = getCaptchaConfig();
const captchaPlugins = captchaConfig
  ? [
      captcha({
        provider: CAPTCHA_PROVIDER,
        secretKey: captchaConfig.secretKey,
        endpoints: [...CAPTCHA_PROTECTED_AUTH_PATHS],
        // Same hostname pinning as lib/captcha's own verifier (register route).
        allowedHostnames:
          captchaConfig.allowedHostnames.length > 0
            ? captchaConfig.allowedHostnames
            : undefined,
      }),
    ]
  : [];

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: allowedOrigins(),
  database: { db: serviceDb, type: "postgres" },
  user: {
    modelName: "auth_users",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    additionalFields: {
      inviteCode: {
        type: "string",
        required: false,
        input: true,
        fieldName: "invite_code",
      },
      // Signed up from a family invitation: no family of its own
      // (handle_new_user), the gate checks the invitation instead.
      familyInvitationId: {
        type: "string",
        required: false,
        input: true,
        fieldName: "family_invitation_id",
      },
    },
  },
  session: {
    modelName: "auth_sessions",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    expiresIn: 30 * ONE_DAY,
    updateAge: ONE_DAY,
  },
  account: {
    modelName: "auth_accounts",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "auth_verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  advanced: {
    database: { generateId: "uuid" },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    autoSignIn: false,
    // A registered address gets no code from sign-up (the answer stays the
    // generic success): its owner is told by email instead.
    onExistingUserSignUp: ({ user }) => sendAccountExistsNotice(user),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
  },
  databaseHooks: {
    user: {
      create: {
        before: registrationGate,
      },
    },
  },
  rateLimit: AUTH_RATE_LIMIT,
  plugins: [
    bearer(),
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 60,
      allowedAttempts: 5,
      disableSignUp: true,
      overrideDefaultEmailVerification: true,
      sendVerificationOTP,
    }),
    passwordOps(),
    verifiedAccountOtpGuard(),
    ...captchaPlugins,
  ],
});

export type AuthSession = typeof auth.$Infer.Session;

/**
 * Re-authentication for destructive operations (account deletion): true when
 * `password` is the password of the session in `headers`. Same check as
 * POST /api/auth/password/verify, but in-process, so Better Auth's rate limit
 * does not apply and the caller must limit attempts itself.
 */
export async function verifySessionPassword(
  headers: Headers,
  password: string,
): Promise<boolean> {
  try {
    const result = await auth.api.verifyAccountPassword({ body: { password }, headers });
    return result.ok;
  } catch (error) {
    // No session, or an account without a password: not a match.
    if (error instanceof APIError) return false;
    throw error;
  }
}
