/**
 * The forgot-password flow, shared by every client.
 *
 * Step one (reset-password): the platform emails a SIGN-IN code; entering it
 * signs the parent in on this device. Step two (update-password): set the new
 * auth password on that session and, because data is end-to-end encrypted and
 * the old password is unknown, re-wrap the vault under the new password with
 * the nsec account key. The nsec is verified before either is changed, so the
 * auth password and the vault wrap never diverge on a typo.
 *
 * Errors come back as `auth` message keys (or, for update-password, the
 * server's / vault's own text where the web has always shown it).
 */
import { isValidNsec } from "@dodi/crypto";

import {
  type AuthApi,
  type AuthMessageKey,
  captchaHeaders,
  isCaptchaError,
  MIN_PASSWORD_LENGTH,
  otpErrorKey,
} from "./auth";
import type { PlatformApi } from "./platform";
import type { VaultStore } from "./vault-store";

/**
 * Ask for the emailed code. The code step is the uniform answer whether or not
 * the email exists (anti-enumeration), so a rejected send still advances. A
 * captcha rejection is the one exception: it says nothing about the email, and
 * advancing would park the parent on a code that was never sent.
 * Null = show the code step.
 */
export async function sendResetCode(
  auth: AuthApi,
  input: { email: string; captchaToken: string | null },
): Promise<AuthMessageKey | null> {
  const { error } = await auth.sendSignInOtp(
    { email: input.email },
    captchaHeaders(input.captchaToken),
  );
  return error && isCaptchaError(error.code) ? "captchaFailed" : null;
}

/** Re-send the code from the code step. Null on success. */
export async function resendResetCode(
  auth: AuthApi,
  input: { email: string; captchaToken: string | null },
): Promise<AuthMessageKey | null> {
  const { error } = await auth.sendSignInOtp(
    { email: input.email },
    captchaHeaders(input.captchaToken),
  );
  if (!error) return null;
  return isCaptchaError(error.code) ? "captchaFailed" : "resendFailed";
}

/**
 * Enter the code: success signs the parent in (the bearer is stored), and the
 * caller moves on to update-password. Null on success.
 */
export async function verifyResetCode(
  auth: AuthApi,
  input: { email: string; code: string },
): Promise<AuthMessageKey | null> {
  const { error } = await auth.signInEmailOtp({ email: input.email, otp: input.code });
  return error ? otpErrorKey(error.code) : null;
}

/**
 * Whether the signed-in account has a stored vault (so update-password asks
 * for the account key). A failed check counts as no vault, as on the web.
 */
export async function hasStoredVault(api: Pick<PlatformApi, "getVaultKeys">): Promise<boolean> {
  try {
    return (await api.getVaultKeys()) !== null;
  } catch {
    return false;
  }
}

export interface NewPasswordInput {
  password: string;
  confirmPassword: string;
  /** The nsec account key; only checked when the account has a vault. */
  nsec: string;
  hasVault: boolean;
}

/** The form's own checks, before anything changes. */
export function validateNewPassword(input: NewPasswordInput): AuthMessageKey | null {
  if (input.password !== input.confirmPassword) return "passwordsNoMatch";
  if (input.password.length < MIN_PASSWORD_LENGTH) return "passwordTooShort";
  if (input.hasVault && !isValidNsec(input.nsec)) return "invalidAccountKey";
  return null;
}

export type UpdatePasswordOutcome =
  | { kind: "done" }
  /** Show this message: a key, or the server's / vault's own text. */
  | { kind: "error"; key?: AuthMessageKey; message?: string };

/**
 * Set the new password on the session the code opened. With a vault, the nsec
 * is verified first, then the auth password changes, then the vault is
 * re-wrapped (all-or-nothing on the nsec check) and this device unlocks.
 */
export async function updatePassword(
  deps: { auth: AuthApi; vault: VaultStore },
  input: NewPasswordInput,
): Promise<UpdatePasswordOutcome> {
  const invalid = validateNewPassword(input);
  if (invalid) return { kind: "error", key: invalid };

  const updateAuthPassword = async (): Promise<void> => {
    const { error } = await deps.auth.setPassword({ password: input.password });
    if (error) throw new PasswordSetError(error.message);
  };

  try {
    if (input.hasVault) {
      await deps.vault
        .getState()
        .resetPasswordWithNsec(input.nsec, input.password, updateAuthPassword);
    } else {
      await updateAuthPassword();
    }
    return { kind: "done" };
  } catch (error) {
    if (error instanceof PasswordSetError) {
      return error.serverMessage !== undefined
        ? { kind: "error", message: error.serverMessage }
        : { kind: "error", key: "updatePasswordFailed" };
    }
    return error instanceof Error
      ? { kind: "error", message: error.message }
      : { kind: "error", key: "updatePasswordFailed" };
  }
}

/** The platform refused the new password (its message, when it sent one). */
class PasswordSetError extends Error {
  constructor(readonly serverMessage: string | undefined) {
    super(serverMessage ?? "password set failed");
  }
}
