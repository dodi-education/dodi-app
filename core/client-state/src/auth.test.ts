import { beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { AccountStore } from "./account-store";
import {
  type AuthApi,
  captchaHeaders,
  otpErrorKey,
  signIn,
  signUpErrorKey,
  startRegistration,
  validateRegistration,
  verifyRegistrationCode,
  verifySignInCode,
} from "./auth";
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
    sessionUser: vi.fn(async () => ({ id: "u1", email: "parent@example.com" })),
    ...patch,
  };
}

let vaultActions: {
  unlockOrBootstrap: ReturnType<typeof vi.fn>;
  createLocalVault: ReturnType<typeof vi.fn>;
  finalizeVault: ReturnType<typeof vi.fn>;
  discardLocalVault: ReturnType<typeof vi.fn>;
};
let vault: VaultStore;
let account: AccountStore;

beforeEach(() => {
  vaultActions = {
    unlockOrBootstrap: vi.fn(async () => ({ created: false })),
    createLocalVault: vi.fn(async () => {}),
    finalizeVault: vi.fn(async () => {}),
    discardLocalVault: vi.fn(async () => {}),
  };
  vault = createStore(() => vaultActions as unknown as VaultState);
  account = createStore(() => ({
    account: { language: "de" },
    load: vi.fn(async () => {}),
  })) as unknown as AccountStore;
});

const REGISTRATION = {
  email: "parent@example.com",
  password: "hunter2-password",
  confirmPassword: "hunter2-password",
  mode: "open" as const,
  inviteCode: "",
  importedNsec: "",
};

describe("sign-in", () => {
  it("sends the captcha token, opens the vault and returns the account language", async () => {
    const auth = fakeAuth();
    const outcome = await signIn(
      { auth, vault, account },
      { email: "a@b.c", password: "pw", captchaToken: "tok" },
    );
    expect(auth.signInEmail).toHaveBeenCalledWith(
      { email: "a@b.c", password: "pw" },
      { "x-captcha-response": "tok" },
    );
    expect(vaultActions.unlockOrBootstrap).toHaveBeenCalledWith("pw", "a@b.c");
    expect(outcome).toEqual({ kind: "signed_in", isNewVault: false, language: "de" });
  });

  it("asks for the emailed code when the email is unconfirmed", async () => {
    const auth = fakeAuth({ signInEmail: async () => ({ error: { code: "EMAIL_NOT_VERIFIED" } }) });
    const outcome = await signIn(
      { auth, vault, account },
      { email: "a", password: "p", captchaToken: null },
    );
    expect(outcome).toEqual({ kind: "needs_code" });
    expect(vaultActions.unlockOrBootstrap).not.toHaveBeenCalled();
  });

  it("separates captcha failures from credential errors", async () => {
    const captcha = fakeAuth({
      signInEmail: async () => ({ error: { code: "VERIFICATION_FAILED" } }),
    });
    await expect(
      signIn({ auth: captcha, vault, account }, { email: "a", password: "p", captchaToken: null }),
    ).resolves.toEqual({ kind: "error", key: "captchaFailed" });

    const wrong = fakeAuth({
      signInEmail: async () => ({
        error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" },
      }),
    });
    await expect(
      signIn({ auth: wrong, vault, account }, { email: "a", password: "p", captchaToken: null }),
    ).resolves.toEqual({ kind: "error", message: "Invalid email or password" });
  });

  it("reports a vault that won't open after a good sign-in", async () => {
    vaultActions.unlockOrBootstrap.mockRejectedValue(new Error("bad key"));
    await expect(
      signIn(
        { auth: fakeAuth(), vault, account },
        { email: "a", password: "p", captchaToken: null },
      ),
    ).resolves.toEqual({ kind: "error", key: "unlockAfterLoginFailed" });
  });

  it("maps code errors and opens the vault once the code checks out", async () => {
    const expired = fakeAuth({ verifyEmail: async () => ({ error: { code: "OTP_EXPIRED" } }) });
    await expect(
      verifySignInCode(
        { auth: expired, vault, account },
        { email: "a", password: "p", code: "123456" },
      ),
    ).resolves.toEqual({ kind: "error", key: "codeExpired" });

    vaultActions.unlockOrBootstrap.mockResolvedValue({ created: true });
    await expect(
      verifySignInCode(
        { auth: fakeAuth(), vault, account },
        { email: "a", password: "p", code: "123456" },
      ),
    ).resolves.toMatchObject({ kind: "signed_in", isNewVault: true });
  });
});

describe("registration", () => {
  it("validates the form before anything leaves the device", () => {
    expect(validateRegistration({ ...REGISTRATION, confirmPassword: "other" })).toBe(
      "passwordsNoMatch",
    );
    expect(
      validateRegistration({ ...REGISTRATION, password: "short", confirmPassword: "short" }),
    ).toBe("passwordTooShort");
    expect(validateRegistration({ ...REGISTRATION, mode: "invite" })).toBe("inviteRequired");
    expect(validateRegistration({ ...REGISTRATION, importedNsec: "nsec1nope" })).toBe(
      "invalidAccountKey",
    );
    expect(validateRegistration(REGISTRATION)).toBeNull();
  });

  it("registers, then seals the vault locally with the imported key", async () => {
    const auth = fakeAuth();
    const result = await startRegistration(
      { auth, vault },
      { ...REGISTRATION, mode: "invite", inviteCode: " CODE ", captchaToken: null },
    );
    expect(result).toBeNull();
    expect(auth.register).toHaveBeenCalledWith(
      { email: REGISTRATION.email, password: REGISTRATION.password, inviteCode: "CODE" },
      {},
    );
    expect(vaultActions.createLocalVault).toHaveBeenCalledWith(
      REGISTRATION.email,
      REGISTRATION.password,
      undefined,
    );
  });

  it("never builds a vault for a rejected sign-up", async () => {
    const auth = fakeAuth({
      register: async () => ({ error: { message: "Registration is closed" } }),
    });
    await expect(
      startRegistration({ auth, vault }, { ...REGISTRATION, captchaToken: null }),
    ).resolves.toBe("registrationClosed");
    expect(vaultActions.createLocalVault).not.toHaveBeenCalled();
  });

  it("finalizes after the code, and drops the vault when the imported key is taken", async () => {
    const isConflict = (e: unknown) => e instanceof Error && e.message === "taken";
    await expect(
      verifyRegistrationCode(
        { auth: fakeAuth(), vault },
        { email: "a", code: "123456" },
        isConflict,
      ),
    ).resolves.toEqual({ kind: "done" });

    vaultActions.finalizeVault.mockRejectedValueOnce(new Error("taken"));
    await expect(
      verifyRegistrationCode(
        { auth: fakeAuth(), vault },
        { email: "a", code: "123456" },
        isConflict,
      ),
    ).resolves.toEqual({ kind: "error", key: "nsecTaken" });
    expect(vaultActions.discardLocalVault).toHaveBeenCalled();

    vaultActions.finalizeVault.mockRejectedValueOnce(new Error("network"));
    await expect(
      verifyRegistrationCode(
        { auth: fakeAuth(), vault },
        { email: "a", code: "123456" },
        isConflict,
      ),
    ).resolves.toEqual({ kind: "retry_finalize", key: "vaultSetupFailed" });
  });
});

describe("message mapping", () => {
  it("maps platform codes to message keys", () => {
    expect(otpErrorKey("TOO_MANY_ATTEMPTS")).toBe("tooManyAttempts");
    expect(otpErrorKey("INVALID_OTP")).toBe("wrongCode");
    expect(signUpErrorKey({ message: "Invalid invite code" })).toBe("invalidInviteCode");
    expect(signUpErrorKey({ message: "", code: "MISSING_RESPONSE" })).toBe("captchaFailed");
    expect(signUpErrorKey({ message: "User already exists" })).toBe("genericSignupError");
    expect(captchaHeaders(null)).toEqual({});
  });
});
