import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { AuthApi } from "./auth";
import { finishSetup, validateFinishSetup } from "./finish-setup";
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

function fakeVault(unlockOrBootstrap: () => Promise<{ created: boolean }>): {
  vault: VaultStore;
  unlock: ReturnType<typeof vi.fn>;
} {
  const unlock = vi.fn(unlockOrBootstrap);
  return {
    vault: createStore(() => ({ unlockOrBootstrap: unlock }) as unknown as VaultState),
    unlock,
  };
}

const INPUT = { email: "a@b.c", password: "long-password", captchaToken: "tok" };

describe("finish setup", () => {
  it("checks the password length first", async () => {
    expect(validateFinishSetup("short")).toBe("passwordTooShort");
    expect(validateFinishSetup("long-password")).toBeNull();
    const auth = fakeAuth();
    const { vault } = fakeVault(async () => ({ created: true }));
    await expect(finishSetup({ auth, vault }, { ...INPUT, password: "x" })).resolves.toEqual({
      kind: "error",
      key: "passwordTooShort",
    });
    expect(auth.signInEmail).not.toHaveBeenCalled();
  });

  it("verifies the password with a captcha'd sign-in, then opens the vault with it", async () => {
    const auth = fakeAuth();
    const { vault, unlock } = fakeVault(async () => ({ created: true }));
    await expect(finishSetup({ auth, vault }, INPUT)).resolves.toEqual({ kind: "ok", created: true });
    expect(auth.signInEmail).toHaveBeenCalledWith(
      { email: "a@b.c", password: "long-password" },
      { "x-captcha-response": "tok" },
    );
    expect(unlock).toHaveBeenCalledWith("long-password");
  });

  it("never touches the vault for a wrong password", async () => {
    const auth = fakeAuth({ signInEmail: async () => ({ error: { code: "INVALID_EMAIL_OR_PASSWORD" } }) });
    const { vault, unlock } = fakeVault(async () => ({ created: false }));
    await expect(finishSetup({ auth, vault }, INPUT)).resolves.toEqual({
      kind: "error",
      key: "finishSetupWrongPassword",
    });
    expect(unlock).not.toHaveBeenCalled();
  });

  it("tells captcha failures apart", async () => {
    const auth = fakeAuth({ signInEmail: async () => ({ error: { code: "MISSING_RESPONSE" } }) });
    const { vault } = fakeVault(async () => ({ created: false }));
    await expect(finishSetup({ auth, vault }, INPUT)).resolves.toEqual({
      kind: "error",
      key: "captchaFailed",
    });
  });

  it("reports a failed vault setup", async () => {
    const { vault } = fakeVault(async () => {
      throw new Error("boom");
    });
    await expect(finishSetup({ auth: fakeAuth(), vault }, INPUT)).resolves.toEqual({
      kind: "error",
      key: "vaultSetupFailed",
    });
  });
});
