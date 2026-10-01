import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import { changePassword } from "./change-password";
import type { VaultState, VaultStore } from "./vault-store";

function deps(authError: { message?: string } | null = null, vaultError?: Error) {
  const rewrap = vi.fn(async () => {
    if (vaultError) throw vaultError;
  });
  return {
    auth: { setPassword: vi.fn(async () => ({ error: authError })) },
    vault: createStore(() => ({ changePassword: rewrap }) as unknown as VaultState) as VaultStore,
    rewrap,
  };
}

const GOOD = { password: "long-enough", confirm: "long-enough" };

describe("change password", () => {
  it("checks the form before calling anything", async () => {
    const d = deps();
    await expect(changePassword(d, { password: "abcdefgh", confirm: "abcdefgx" })).resolves.toEqual({
      kind: "error",
      key: "passwordsNoMatch",
    });
    await expect(changePassword(d, { password: "short", confirm: "short" })).resolves.toEqual({
      kind: "error",
      key: "passwordTooShort",
    });
    expect(d.auth.setPassword).not.toHaveBeenCalled();
  });

  it("updates the auth password, then re-wraps the vault", async () => {
    const d = deps();
    await expect(changePassword(d, GOOD)).resolves.toEqual({ kind: "done" });
    expect(d.auth.setPassword).toHaveBeenCalledWith({ password: "long-enough" });
    expect(d.rewrap).toHaveBeenCalledWith("long-enough");
  });

  it("leaves the vault untouched when the auth update is rejected", async () => {
    const d = deps({ message: "Session expired" });
    await expect(changePassword(d, GOOD)).resolves.toEqual({ kind: "error", message: "Session expired" });
    expect(d.rewrap).not.toHaveBeenCalled();
    await expect(changePassword(deps({}), GOOD)).resolves.toEqual({
      kind: "error",
      key: "changePasswordFailed",
    });
  });

  it("reports a vault re-wrap failure", async () => {
    await expect(changePassword(deps(null, new Error("Vault is locked")), GOOD)).resolves.toEqual({
      kind: "error",
      message: "Vault is locked",
    });
  });
});
