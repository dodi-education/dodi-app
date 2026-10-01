/**
 * Finish setup: the safety net for a signed-in account WITHOUT a vault
 * ("needs-setup": a registration whose vault persist failed, an account that
 * predates the vault, a reset on an account without one). The password is
 * verified against the account first (a sign-in, so it carries the captcha
 * token), so the vault password stays in sync with auth, and only then is the
 * vault bootstrapped or unlocked with it.
 */
import {
  type AuthApi,
  type AuthMessageKey,
  captchaHeaders,
  isCaptchaError,
  MIN_PASSWORD_LENGTH,
} from "./auth";
import type { VaultStore } from "./vault-store";

/** The form's own check, before the captcha and the sign-in. */
export function validateFinishSetup(password: string): AuthMessageKey | null {
  return password.length < MIN_PASSWORD_LENGTH ? "passwordTooShort" : null;
}

export type FinishSetupOutcome =
  /** The vault is open. `created`: show the account key next. */
  | { kind: "ok"; created: boolean }
  | { kind: "error"; key: AuthMessageKey };

export async function finishSetup(
  deps: { auth: AuthApi; vault: VaultStore },
  input: { email: string; password: string; captchaToken: string | null },
): Promise<FinishSetupOutcome> {
  const invalid = validateFinishSetup(input.password);
  if (invalid) return { kind: "error", key: invalid };

  const { error } = await deps.auth.signInEmail(
    { email: input.email, password: input.password },
    captchaHeaders(input.captchaToken),
  );
  if (error) {
    return {
      kind: "error",
      key: isCaptchaError(error.code) ? "captchaFailed" : "finishSetupWrongPassword",
    };
  }
  try {
    const { created } = await deps.vault.getState().unlockOrBootstrap(input.password);
    return { kind: "ok", created };
  } catch {
    return { kind: "error", key: "vaultSetupFailed" };
  }
}
