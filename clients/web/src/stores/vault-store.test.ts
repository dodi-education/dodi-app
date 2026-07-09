/**
 * Register (email-OTP) split of the vault bootstrap: `createLocalVault` must build
 * + seal the vault WITHOUT any server write, and `finalizeVault` must persist it
 * once, activate the session, reveal the phrase, and stay retry-safe on a failed
 * save. The crypto itself is covered in core/vault; here we mock it and assert the
 * store's orchestration + the "never persist before confirm" invariant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sealedRef, saveVaultKeysMock, fetchVaultKeysMock } = vi.hoisted(() => ({
  sealedRef: { current: null as string | null },
  saveVaultKeysMock: vi.fn(),
  fetchVaultKeysMock: vi.fn(),
}));

// In-memory stand-in for the IndexedDB-backed seal (unavailable in the node env).
vi.mock("@/lib/sealed-secret", () => ({
  stashSealedSecret: vi.fn(async (s: string) => {
    sealedRef.current = s;
  }),
  consumeSealedSecret: vi.fn(async () => {
    const v = sealedRef.current;
    sealedRef.current = null; // single-use: read wipes
    return v;
  }),
  clearSealedSecret: vi.fn(async () => {
    sealedRef.current = null;
  }),
}));

// Mocking vault-client also avoids loading the real Supabase client (needs env).
vi.mock("@/lib/vault-client", () => ({
  saveVaultKeys: saveVaultKeysMock,
  fetchVaultKeys: fetchVaultKeysMock,
}));

vi.mock("@/lib/parent-lock", () => ({
  markParentUnlocked: vi.fn(),
  clearParentUnlocked: vi.fn(),
}));

vi.mock("@dodi/vault", () => ({
  VaultSession: class {
    constructor(public vmk: Uint8Array) {}
    lock() {}
  },
  createAccountVault: vi.fn(({ device }: { device: { deviceId: string } }) => ({
    backupPhrase: "alpha bravo charlie",
    vmk: new Uint8Array([1, 2, 3]),
    storedKeys: {
      deviceWraps: [{ deviceId: device.deviceId }],
      passwordWrap: { scheme: "password", salt: "s" },
      vmkCheck: "enc:v1:x",
    },
  })),
  getOrCreateDevice: vi.fn(async () => ({
    deviceId: "dev-1",
    kem: { publicKey: new Uint8Array([9]), secretKey: new Uint8Array([8]) },
  })),
  createIndexedDbDeviceKeystore: vi.fn(() => ({})),
  addDeviceToVault: vi.fn(),
  removeDeviceFromVault: vi.fn(),
  setVaultPassword: vi.fn(),
  unlockVaultWithDevice: vi.fn(),
  unlockVaultWithPassword: vi.fn(),
  unlockVaultWithPhrase: vi.fn(),
}));

vi.mock("@dodi/crypto", () => ({
  toBase64Url: vi.fn(() => "b64url"),
  deriveVaultMasterKeyFromPhrase: vi.fn(() => new Uint8Array([7, 7, 7])),
}));

import { useVaultStore } from "./vault-store";

beforeEach(() => {
  sealedRef.current = null;
  saveVaultKeysMock.mockReset();
  saveVaultKeysMock.mockResolvedValue(undefined);
  fetchVaultKeysMock.mockReset();
  fetchVaultKeysMock.mockResolvedValue(null);
  useVaultStore.setState({
    status: "idle",
    session: null,
    pendingBackupPhrase: null,
    pendingVault: null,
    error: null,
  });
});

describe("vault-store register split", () => {
  it("createLocalVault seals the vault and writes nothing to the server", async () => {
    await useVaultStore.getState().createLocalVault("hunter2-password");

    expect(saveVaultKeysMock).not.toHaveBeenCalled();
    expect(sealedRef.current).toBeTruthy();
    const parsed = JSON.parse(sealedRef.current!);
    expect(parsed.backupPhrase).toBe("alpha bravo charlie");
    expect(parsed.storedKeys.passwordWrap).toBeTruthy();
    // No session, no status flip while still on public /register.
    expect(useVaultStore.getState().session).toBeNull();
    expect(useVaultStore.getState().status).toBe("idle");
  });

  it("finalizeVault persists once, activates the session, reveals the phrase", async () => {
    await useVaultStore.getState().createLocalVault("hunter2-password");
    await useVaultStore.getState().finalizeVault();

    expect(saveVaultKeysMock).toHaveBeenCalledTimes(1);
    const s = useVaultStore.getState();
    expect(s.status).toBe("unlocked");
    expect(s.pendingBackupPhrase).toBe("alpha bravo charlie");
    expect(s.session).not.toBeNull();
    expect(s.pendingVault).toBeNull();
    expect(sealedRef.current).toBeNull(); // seal cleared after success
  });

  it("retries via pendingVault when saveVaultKeys fails, without re-consuming the seal", async () => {
    await useVaultStore.getState().createLocalVault("hunter2-password");

    saveVaultKeysMock.mockRejectedValueOnce(new Error("network"));
    await expect(useVaultStore.getState().finalizeVault()).rejects.toThrow();

    // Seal was consumed on the first attempt, but the data is retained in memory.
    expect(sealedRef.current).toBeNull();
    expect(useVaultStore.getState().pendingVault).not.toBeNull();

    await useVaultStore.getState().finalizeVault();
    expect(saveVaultKeysMock).toHaveBeenCalledTimes(2);
    expect(useVaultStore.getState().status).toBe("unlocked");
  });

  it("finalizeVault throws when there is no seal and no pending vault", async () => {
    await expect(useVaultStore.getState().finalizeVault()).rejects.toThrow(
      /registration-seal-missing/,
    );
  });

  it("discardLocalVault clears the seal and the pending vault", async () => {
    await useVaultStore.getState().createLocalVault("hunter2-password");
    useVaultStore.setState({
      pendingVault: { storedKeys: {} as never, backupPhrase: "x" },
    });

    await useVaultStore.getState().discardLocalVault();
    expect(sealedRef.current).toBeNull();
    expect(useVaultStore.getState().pendingVault).toBeNull();
  });
});
