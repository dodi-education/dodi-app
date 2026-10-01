import { describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { AccountStore } from "./account-store";
import { removeParentPin, sanitizePinInput, saveParentPin } from "./parent-pin";
import type { PlatformApi } from "./platform";
import type { VaultState, VaultStore } from "./vault-store";

function fakeApi(response: Response | Error): PlatformApi & { request: ReturnType<typeof vi.fn> } {
  return {
    request: vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }),
    getVaultKeys: async () => null,
    putVaultKeys: async () => {},
  };
}

function deps(response: Response | Error, hasSession = true) {
  const order: string[] = [];
  const patchLocal = vi.fn(() => order.push("patchLocal"));
  const markUnlocked = vi.fn(() => order.push("markUnlocked"));
  const session = hasSession ? { encryptField: (v: string) => `enc:v1:${v}` } : null;
  return {
    api: fakeApi(response),
    account: createStore(() => ({ patchLocal })) as unknown as AccountStore,
    vault: createStore(() => ({ session }) as unknown as VaultState) as VaultStore,
    parentLock: { markUnlocked },
    patchLocal,
    markUnlocked,
    order,
  };
}

describe("parent PIN", () => {
  it("keeps digits only, four at most", () => {
    expect(sanitizePinInput("1a2 3-45")).toBe("1234");
  });

  it("seals the PIN, keeps the area unlocked, then caches it", async () => {
    const d = deps(new Response("{}"));
    await expect(saveParentPin(d, "1234")).resolves.toEqual({ kind: "done", key: "saved" });
    expect(JSON.parse(d.api.request.mock.calls[0][1].body)).toEqual({ parentPinEnc: "enc:v1:1234" });
    expect(d.order).toEqual(["markUnlocked", "patchLocal"]);
    expect(d.patchLocal).toHaveBeenCalledWith({ parent_pin_enc: "enc:v1:1234" });
  });

  it("rejects a short PIN and a locked vault without a request", async () => {
    const d = deps(new Response("{}"));
    await expect(saveParentPin(d, "12")).resolves.toEqual({ kind: "error", key: "invalid" });
    const locked = deps(new Response("{}"), false);
    await expect(saveParentPin(locked, "1234")).resolves.toEqual({ kind: "error", key: "saveFailed" });
    expect(d.api.request).not.toHaveBeenCalled();
    expect(locked.api.request).not.toHaveBeenCalled();
  });

  it("caches nothing when the save fails", async () => {
    const d = deps(new Response("{}", { status: 500 }));
    await expect(saveParentPin(d, "1234")).resolves.toEqual({ kind: "error", key: "saveFailed" });
    expect(d.patchLocal).not.toHaveBeenCalled();
    expect(d.markUnlocked).not.toHaveBeenCalled();
  });

  it("removes the PIN", async () => {
    const d = deps(new Response("{}"));
    await expect(removeParentPin(d)).resolves.toEqual({ kind: "done", key: "removed" });
    expect(JSON.parse(d.api.request.mock.calls[0][1].body)).toEqual({ parentPinEnc: null });
    expect(d.patchLocal).toHaveBeenCalledWith({ parent_pin_enc: null });

    const offline = deps(new Error("offline"));
    await expect(removeParentPin(offline)).resolves.toEqual({ kind: "error", key: "saveFailed" });
  });
});
