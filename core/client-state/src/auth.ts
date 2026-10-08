/**
 * The sign-in and registration flows, shared by every client: which platform
 * calls happen in which order, how the E2EE vault is unlocked or adopted with
 * the password while it is in hand, and how auth errors map to UI messages.
 * Clients render the forms and pass an `AuthApi` over their Better Auth client.
 *
 * Errors come back as message KEYS of the `auth` namespace in
 * core/intl/messages, never as raw server text (that could leak whether an
 * account exists).
 */
import { isValidNsec } from "@dodi/crypto";

import type { AccountStore } from "./account-store";
import type { VaultStore } from "./vault-store";

/** The header carrying a captcha (Turnstile) token on the auth front doors. */
export const CAPTCHA_HEADER = "x-captcha-response";

/** Error codes the platform answers with when a token is missing or rejected. */
const CAPTCHA_ERROR_CODES = new Set(["MISSING_RESPONSE", "VERIFICATION_FAILED"]);

/** True for an auth error caused by the captcha check (not by credentials). */
export function isCaptchaError(code: string | undefined | null): boolean {
  return !!code && CAPTCHA_ERROR_CODES.has(code);
}

/** Request headers carrying the token; empty when captcha is off (token null). */
export function captchaHeaders(token: string | null): Record<string, string> {
  return token ? { [CAPTCHA_HEADER]: token } : {};
}

export type RegistrationMode = "open" | "invite" | "closed";

/** Keys of the `auth` message namespace the flows can answer with. */
export type AuthMessageKey =
  | "captchaFailed"
  | "captchaUnavailable"
  | "wrongCode"
  | "codeExpired"
  | "tooManyAttempts"
  | "resendFailed"
  | "invalidInviteCode"
  | "registrationClosed"
  | "genericSignupError"
  | "passwordsNoMatch"
  | "passwordTooShort"
  | "inviteRequired"
  | "invalidAccountKey"
  | "vaultSetupFailed"
  | "nsecTaken"
  | "unlockAfterLoginFailed"
  | "updatePasswordFailed"
  | "finishSetupWrongPassword"
  | "termsRequired";

export const MIN_PASSWORD_LENGTH = 8;
export const RESEND_COOLDOWN_SECONDS = 60;

/** A Better Auth error, as far as the flows read it. */
export interface AuthError {
  code?: string;
  message?: string;
  statusText?: string;
}

/** The auth calls the flows make (each client adapts its Better Auth client). */
export interface AuthApi {
  signInEmail(
    input: { email: string; password: string },
    headers: Record<string, string>,
  ): Promise<{ error: AuthError | null }>;
  verifyEmail(input: { email: string; otp: string }): Promise<{ error: AuthError | null }>;
  sendVerificationOtp(
    input: { email: string },
    headers: Record<string, string>,
  ): Promise<{ error: AuthError | null }>;
  /**
   * The platform's /api/auth/register front door. It answers ok for ANY
   * well-formed email (new or registered), so nothing leaks account existence.
   */
  register(
    input: { email: string; password: string; inviteCode?: string },
    headers: Record<string, string>,
  ): Promise<{ error: { message: string; code?: string } | null }>;
  registrationMode(): Promise<RegistrationMode>;
  /**
   * Email a SIGN-IN code (the password reset: entering it signs the parent in,
   * and the new password is then set on that session).
   */
  sendSignInOtp(
    input: { email: string },
    headers: Record<string, string>,
  ): Promise<{ error: AuthError | null }>;
  /** Sign in with an emailed sign-in code (stores the bearer on success). */
  signInEmailOtp(input: { email: string; otp: string }): Promise<{ error: AuthError | null }>;
  /** Set a new password on the current session; the platform revokes every other session. */
  setPassword(input: { password: string }): Promise<{ error: AuthError | null }>;
  /** The signed-in user (one /get-session round trip), or null without a session. */
  sessionUser(): Promise<{ id: string; email: string } | null>;
}

/** The emailed-code errors the platform names. */
export function otpErrorKey(code: string | undefined): AuthMessageKey {
  if (code === "OTP_EXPIRED") return "codeExpired";
  if (code === "TOO_MANY_ATTEMPTS") return "tooManyAttempts";
  return "wrongCode";
}

/** Map a /register rejection to copy; never echo raw auth errors. */
export function signUpErrorKey(rejection: { message: string; code?: string }): AuthMessageKey {
  if (isCaptchaError(rejection.code)) return "captchaFailed";
  const m = rejection.message.toLowerCase();
  if (m.includes("invite")) return "invalidInviteCode";
  if (m.includes("closed")) return "registrationClosed";
  return "genericSignupError";
}

export interface RegistrationInput {
  email: string;
  password: string;
  confirmPassword: string;
  mode: RegistrationMode;
  inviteCode: string;
  /** Advanced: bring an existing Nostr key as the account key ("" = generate). */
  importedNsec: string;
  /** The parent confirmed they are an adult guardian and accepted the terms and privacy policy. */
  hasAcceptedTerms: boolean;
}

/** The form's own checks, before anything goes to the platform. */
export function validateRegistration(input: RegistrationInput): AuthMessageKey | null {
  if (input.password !== input.confirmPassword) return "passwordsNoMatch";
  if (input.password.length < MIN_PASSWORD_LENGTH) return "passwordTooShort";
  if (input.mode === "invite" && !input.inviteCode.trim()) return "inviteRequired";
  if (input.importedNsec.trim() && !isValidNsec(input.importedNsec)) return "invalidAccountKey";
  if (!input.hasAcceptedTerms) return "termsRequired";
  return null;
}

export interface AuthFlowDeps {
  auth: AuthApi;
  vault: VaultStore;
  account: AccountStore;
}

export type SignInOutcome =
  /** Signed in and the vault is open. `isNewVault`: show the account key next. */
  | { kind: "signed_in"; isNewVault: boolean; language: string | null }
  /** The account never confirmed its email; the platform emailed a fresh code. */
  | { kind: "needs_code" }
  /** Show this message: a key, or the server's own text for credential errors. */
  | { kind: "error"; key?: AuthMessageKey; message?: string };

/**
 * Signed in (the bearer is stored): unlock the vault with the same password.
 * When the account has no vault yet, this adopts the one registration sealed
 * for this same email (preserving an imported nsec) before falling back to a
 * fresh vault. The account loads alongside, so its saved UI language can
 * follow the parent to this device.
 */
export async function completeSignIn(
  deps: AuthFlowDeps,
  input: { email: string; password: string },
): Promise<SignInOutcome> {
  try {
    const unlock = deps.vault.getState().unlockOrBootstrap(input.password, input.email);
    const accountLoad = deps.account
      .getState()
      .load(true)
      .catch(() => {});
    const { created } = await unlock;
    await accountLoad;
    return {
      kind: "signed_in",
      isNewVault: created,
      language: deps.account.getState().account?.language ?? null,
    };
  } catch {
    return { kind: "error", key: "unlockAfterLoginFailed" };
  }
}

export async function signIn(
  deps: AuthFlowDeps,
  input: { email: string; password: string; captchaToken: string | null },
): Promise<SignInOutcome> {
  const { error } = await deps.auth.signInEmail(
    { email: input.email, password: input.password },
    captchaHeaders(input.captchaToken),
  );
  if (error) {
    if (error.code === "EMAIL_NOT_VERIFIED") return { kind: "needs_code" };
    return isCaptchaError(error.code)
      ? { kind: "error", key: "captchaFailed" }
      : { kind: "error", message: error.message ?? error.statusText ?? "" };
  }
  return completeSignIn(deps, input);
}

/** Verify the emailed code at sign-in; success signs in and opens the vault. */
export async function verifySignInCode(
  deps: AuthFlowDeps,
  input: { email: string; password: string; code: string },
): Promise<SignInOutcome> {
  const { error } = await deps.auth.verifyEmail({ email: input.email, otp: input.code });
  if (error) return { kind: "error", key: otpErrorKey(error.code) };
  return completeSignIn(deps, input);
}

/** Re-send the email confirmation code. Null on success. */
export async function resendCode(
  auth: AuthApi,
  input: { email: string; captchaToken: string | null },
): Promise<AuthMessageKey | null> {
  const { error } = await auth.sendVerificationOtp(
    { email: input.email },
    captchaHeaders(input.captchaToken),
  );
  if (!error) return null;
  return isCaptchaError(error.code) ? "captchaFailed" : "resendFailed";
}

/**
 * Registration step one: validate, ask the platform to register (it emails the
 * code), then build and seal the vault on this device while the password is in
 * hand. No server write for the vault and no session yet. The caller drops the
 * password once this resolves and shows the code step.
 */
export async function startRegistration(
  deps: Pick<AuthFlowDeps, "auth" | "vault">,
  input: RegistrationInput & { captchaToken: string | null },
): Promise<AuthMessageKey | null> {
  const invalid = validateRegistration(input);
  if (invalid) return invalid;

  let rejection: { message: string; code?: string } | null;
  try {
    rejection = (
      await deps.auth.register(
        {
          email: input.email,
          password: input.password,
          inviteCode: input.mode === "invite" ? input.inviteCode.trim() : undefined,
        },
        captchaHeaders(input.captchaToken),
      )
    ).error;
  } catch {
    rejection = { message: "" };
  }
  if (rejection) return signUpErrorKey(rejection);

  try {
    await deps.vault
      .getState()
      .createLocalVault(input.email, input.password, input.importedNsec.trim() || undefined);
  } catch {
    return "vaultSetupFailed";
  }
  return null;
}

export type FinishRegistrationOutcome =
  | { kind: "done" }
  /** The code was consumed but persisting failed: offer a plain retry. */
  | { kind: "retry_finalize"; key: AuthMessageKey }
  | { kind: "error"; key: AuthMessageKey };

/**
 * Persist the sealed vault once the code established a session, and reveal the
 * account key. An imported key that belongs to another account can never
 * persist, so the local vault is dropped and "use a different email" remains.
 */
export async function finalizeRegistration(
  vault: VaultStore,
  isNpubConflict: (error: unknown) => boolean,
): Promise<FinishRegistrationOutcome> {
  try {
    await vault.getState().finalizeVault();
    return { kind: "done" };
  } catch (error) {
    if (isNpubConflict(error)) {
      await vault.getState().discardLocalVault();
      return { kind: "error", key: "nsecTaken" };
    }
    return { kind: "retry_finalize", key: "vaultSetupFailed" };
  }
}

/** Registration step two: verify the emailed code, then finalize the vault. */
export async function verifyRegistrationCode(
  deps: Pick<AuthFlowDeps, "auth" | "vault">,
  input: { email: string; code: string },
  isNpubConflict: (error: unknown) => boolean,
): Promise<FinishRegistrationOutcome> {
  const { error } = await deps.auth.verifyEmail({ email: input.email, otp: input.code });
  if (error) return { kind: "error", key: otpErrorKey(error.code) };
  return finalizeRegistration(deps.vault, isNpubConflict);
}
