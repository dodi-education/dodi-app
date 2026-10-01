/**
 * Change the password of a signed-in parent whose vault is open: the auth
 * password first (a rejected update leaves the vault untouched), then the
 * vault is re-wrapped under it. No old password or nsec is needed, the
 * in-memory vault key proves access.
 */
import { type AuthApi, MIN_PASSWORD_LENGTH } from "./auth";
import type { VaultStore } from "./vault-store";

export type ChangePasswordOutcome =
  | { kind: "done" }
  /** A `settings` message key, or the auth / vault error's own text. */
  | { kind: "error"; key?: "passwordsNoMatch" | "passwordTooShort" | "changePasswordFailed"; message?: string };

/** The form's own checks, before anything goes to the platform. */
export function validateNewPassword(
  password: string,
  confirm: string,
): "passwordsNoMatch" | "passwordTooShort" | null {
  if (password !== confirm) return "passwordsNoMatch";
  if (password.length < MIN_PASSWORD_LENGTH) return "passwordTooShort";
  return null;
}

export async function changePassword(
  deps: { auth: Pick<AuthApi, "setPassword">; vault: VaultStore },
  input: { password: string; confirm: string },
): Promise<ChangePasswordOutcome> {
  const invalid = validateNewPassword(input.password, input.confirm);
  if (invalid) return { kind: "error", key: invalid };
  try {
    const { error } = await deps.auth.setPassword({ password: input.password });
    if (error) {
      return error.message
        ? { kind: "error", message: error.message }
        : { kind: "error", key: "changePasswordFailed" };
    }
    await deps.vault.getState().changePassword(input.password);
    return { kind: "done" };
  } catch (err) {
    return err instanceof Error
      ? { kind: "error", message: err.message }
      : { kind: "error", key: "changePasswordFailed" };
  }
}
