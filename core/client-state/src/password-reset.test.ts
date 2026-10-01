import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";
import { generateNsec } from "@dodi/crypto";

import type { AuthApi } from "./auth";
import {
  hasStoredVault,
  resendResetCode,
  sendResetCode,
  updatePassword,
  validateNewPassword,
  verifyResetCode,
} from "./password-reset";
import type { VaultState, VaultStore } from "./vault-store";

const OK = { error: null };

function fakeAuth(patch: Partial<AuthApi> = {}): AuthApi {
  return {
    signInEmail: vi.fn(async () => OK),
    verifyEmail: vi.fn(async () => OK),
    sendVerificationOtp: vi.fn(async () => OK),
    register: vi.fn(async () => OK),
    registrationMode: vi.fn(async () => "open" as const),
    sendSignInOtp: vi.fn(async () => OK),
    signInEmailOtp: vi.fn(async () => OK),
    setPassword: vi.fn(async () => OK),
    sessionUser: vi.fn(async () => null),
    ...patch,
  };
}

function fakeVault(
  resetPasswordWithNsec: VaultState["resetPasswordWithNsec"] = async (_n, _p, onVerified) => {
    await onVerified();
  },
): { vault: VaultStore; reset: ReturnType<typeof vi.fn> } {
  const reset = vi.fn(resetPasswordWithNsec);
  const vault = createStore(() => ({ resetPasswordWithNsec: reset }) as unknown as VaultState);
  return { vault, reset };
}

const NSEC = generateNsec();

describe("sending the reset code", () => {
  it("sends a sign-in code with the captcha token", async () => {
    const auth = fakeAuth();
    await expect(sendResetCode(auth, { email: "a@b.c", captchaToken: "tok" })).resolves.toBeNull();
    expect(auth.sendSignInOtp).toHaveBeenCalledWith(
      { email: "a@b.c" },
      { "x-captcha-response": "tok" },
    );
  });

  it("advances on any other rejection (no account enumeration)", async () => {
    const auth = fakeAuth({ sendSignInOtp: async () => ({ error: { code: "USER_NOT_FOUND" } }) });
    await expect(sendResetCode(auth, { email: "a@b.c", captchaToken: null })).resolves.toBeNull();
  });

  it("stops on a captcha rejection", async () => {
    const auth = fakeAuth({ sendSignInOtp: async () => ({ error: { code: "VERIFICATION_FAILED" } }) });
    await expect(sendResetCode(auth, { email: "a@b.c", captchaToken: "t" })).resolves.toBe(
      "captchaFailed",
    );
  });

  it("reports failed resends", async () => {
    const failing = fakeAuth({ sendSignInOtp: async () => ({ error: { code: "X" } }) });
    await expect(resendResetCode(failing, { email: "a", captchaToken: null })).resolves.toBe(
      "resendFailed",
    );
    const captcha = fakeAuth({ sendSignInOtp: async () => ({ error: { code: "MISSING_RESPONSE" } }) });
    await expect(resendResetCode(captcha, { email: "a", captchaToken: null })).resolves.toBe(
      "captchaFailed",
    );
    await expect(resendResetCode(fakeAuth(), { email: "a", captchaToken: null })).resolves.toBeNull();
  });
});

describe("verifying the reset code", () => {
  it("signs in with the code", async () => {
    const auth = fakeAuth();
    await expect(verifyResetCode(auth, { email: "a@b.c", code: "123456" })).resolves.toBeNull();
    expect(auth.signInEmailOtp).toHaveBeenCalledWith({ email: "a@b.c", otp: "123456" });
  });

  it("maps code errors", async () => {
    const auth = fakeAuth({ signInEmailOtp: async () => ({ error: { code: "OTP_EXPIRED" } }) });
    await expect(verifyResetCode(auth, { email: "a", code: "1" })).resolves.toBe("codeExpired");
  });
});

describe("hasStoredVault", () => {
  it("is true only for stored keys, false on failure", async () => {
    await expect(hasStoredVault({ getVaultKeys: async () => ({}) as never })).resolves.toBe(true);
    await expect(hasStoredVault({ getVaultKeys: async () => null })).resolves.toBe(false);
    await expect(
      hasStoredVault({
        getVaultKeys: async () => {
          throw new Error("offline");
        },
      }),
    ).resolves.toBe(false);
  });
});

describe("updating the password", () => {
  const BASE = { password: "new-password", confirmPassword: "new-password", nsec: "", hasVault: false };

  it("validates before anything changes", () => {
    expect(validateNewPassword({ ...BASE, confirmPassword: "x" })).toBe("passwordsNoMatch");
    expect(validateNewPassword({ ...BASE, password: "short", confirmPassword: "short" })).toBe(
      "passwordTooShort",
    );
    expect(validateNewPassword({ ...BASE, hasVault: true, nsec: "nsec1nope" })).toBe(
      "invalidAccountKey",
    );
    expect(validateNewPassword({ ...BASE, hasVault: true, nsec: NSEC })).toBeNull();
    expect(validateNewPassword(BASE)).toBeNull();
  });

  it("without a vault only sets the auth password", async () => {
    const auth = fakeAuth();
    const { vault, reset } = fakeVault();
    await expect(updatePassword({ auth, vault }, BASE)).resolves.toEqual({ kind: "done" });
    expect(auth.setPassword).toHaveBeenCalledWith({ password: "new-password" });
    expect(reset).not.toHaveBeenCalled();
  });

  it("with a vault re-wraps it via the nsec, setting the password once verified", async () => {
    const auth = fakeAuth();
    const { vault, reset } = fakeVault();
    const outcome = await updatePassword({ auth, vault }, { ...BASE, hasVault: true, nsec: NSEC });
    expect(outcome).toEqual({ kind: "done" });
    expect(reset).toHaveBeenCalledWith(NSEC, "new-password", expect.any(Function));
    expect(auth.setPassword).toHaveBeenCalledTimes(1);
  });

  it("never sets the password for a wrong account key, and shows the vault's error", async () => {
    const auth = fakeAuth();
    const { vault } = fakeVault(async () => {
      throw new Error("Invalid account key");
    });
    const outcome = await updatePassword({ auth, vault }, { ...BASE, hasVault: true, nsec: NSEC });
    expect(outcome).toEqual({ kind: "error", message: "Invalid account key" });
    expect(auth.setPassword).not.toHaveBeenCalled();
  });

  it("shows the server's message, or the generic key without one", async () => {
    const { vault } = fakeVault();
    const withMessage = fakeAuth({ setPassword: async () => ({ error: { message: "Too weak" } }) });
    await expect(updatePassword({ auth: withMessage, vault }, BASE)).resolves.toEqual({
      kind: "error",
      message: "Too weak",
    });
    const bare = fakeAuth({ setPassword: async () => ({ error: { statusText: "Bad" } }) });
    await expect(updatePassword({ auth: bare, vault }, BASE)).resolves.toEqual({
      kind: "error",
      key: "updatePasswordFailed",
    });
  });
});
