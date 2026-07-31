/**
 * Register (email-OTP) split of the vault bootstrap: `createLocalVault` must build
 * + seal the vault WITHOUT any server write, and `finalizeVault` must persist it
 * once, activate the session, reveal the nsec, and stay retry-safe on a failed
 * save. The crypto itself is covered in core/vault; here we mock it and assert the
 * store's orchestration + the "never persist before confirm" invariant.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { sealedRef, saveVaultKeysMock, fetchVaultKeysMock, offlineCacheMock } =
  vi.hoisted(() => ({
    sealedRef: { current: null as string | null },
    saveVaultKeysMock: vi.fn(),
    fetchVaultKeysMock: vi.fn(),
    // Controllable stand-in for the IndexedDB offline cache (absent in node).
    offlineCacheMock: {
      writeVaultKeys: vi.fn(async () => {}),
      readVaultKeys: vi.fn(async (): Promise<unknown> => null),
    },
  }));

vi.mock("@/lib/offline/offline-cache", () => ({
  offlineCache: offlineCacheMock,
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

const MOCK_NSEC = "nsec1mockmockmockmockmockmockmockmockmockmock";
const MOCK_NPUB_HEX = "ab".repeat(32);

vi.mock("@dodi/vault", () => ({
  VaultSession: class {
    constructor(public vmk: Uint8Array) {}
    lock() {}
  },
  createAccountVault: vi.fn(({ device }: { device: { deviceId: string } }) => ({
    nsec: "nsec1mockmockmockmockmockmockmockmockmockmock",
    npubHex: "ab".repeat(32),
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
  unlockVaultWithNsec: vi.fn(),
}));

vi.mock("@dodi/crypto", () => ({
  toBase64Url: vi.fn(() => "b64url"),
  deriveVaultMasterKeyFromNsec: vi.fn(() => new Uint8Array([7, 7, 7])),
  nsecToNpubHex: vi.fn(() => "ab".repeat(32)),
  // Imported by @/lib/argon2-worker (a vault-store side effect); registration
  // itself is skipped in the node environment (no `window`).
  setArgon2idExecutor: vi.fn(),
}));

import { unlockVaultWithDevice, unlockVaultWithPassword } from "@dodi/vault";

import { useConnectivityStore } from "./connectivity-store";
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
    pendingNsec: null,
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
    expect(parsed.nsec).toBe(MOCK_NSEC);
    expect(parsed.storedKeys.passwordWrap).toBeTruthy();
    // No session, no status flip while still on public /register.
    expect(useVaultStore.getState().session).toBeNull();
    expect(useVaultStore.getState().status).toBe("idle");
  });

  it("finalizeVault persists once (with the npub bind), activates the session, reveals the nsec", async () => {
    await useVaultStore.getState().createLocalVault("hunter2-password");
    await useVaultStore.getState().finalizeVault();

    expect(saveVaultKeysMock).toHaveBeenCalledTimes(1);
    expect(saveVaultKeysMock).toHaveBeenCalledWith(
      expect.objectContaining({ vmkCheck: "enc:v1:x" }),
      { npub: MOCK_NPUB_HEX },
    );
    const s = useVaultStore.getState();
    expect(s.status).toBe("unlocked");
    expect(s.pendingNsec).toBe(MOCK_NSEC);
    expect(s.session).not.toBeNull();
    expect(s.pendingVault).toBeNull();
    expect(sealedRef.current).toBeNull(); // seal cleared after success
  });

  it("bootstrap saves the keys with the npub bind and reveals the nsec", async () => {
    await useVaultStore.getState().bootstrap("hunter2-password");

    expect(saveVaultKeysMock).toHaveBeenCalledWith(
      expect.objectContaining({ vmkCheck: "enc:v1:x" }),
      { npub: MOCK_NPUB_HEX },
    );
    const s = useVaultStore.getState();
    expect(s.status).toBe("unlocked");
    expect(s.pendingNsec).toBe(MOCK_NSEC);
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
      pendingVault: { storedKeys: {} as never, nsec: "x" },
    });

    await useVaultStore.getState().discardLocalVault();
    expect(sealedRef.current).toBeNull();
    expect(useVaultStore.getState().pendingVault).toBeNull();
  });
});

describe("vault-store password unlock (login fast path)", () => {
  // The wrapped-keys blob (deviceWraps empty so registration kicks in).
  const keysFixture = () => ({
    deviceWraps: [],
    passwordWrap: { scheme: "password", salt: "s" },
    vmkCheck: "enc:v1:x",
  });

  beforeEach(() => {
    vi.mocked(unlockVaultWithPassword).mockReset();
    vi.mocked(unlockVaultWithPassword).mockResolvedValue(new Uint8Array([1, 2, 3]));
  });

  it("unlockOrBootstrap fetches the vault keys exactly once", async () => {
    const keys = keysFixture();
    fetchVaultKeysMock.mockResolvedValue(keys);

    const { created } = await useVaultStore.getState().unlockOrBootstrap("pw");

    expect(created).toBe(false);
    expect(useVaultStore.getState().status).toBe("unlocked");
    expect(fetchVaultKeysMock).toHaveBeenCalledTimes(1);
    expect(unlockVaultWithPassword).toHaveBeenCalledWith(keys, "pw");
  });

  it("unlock does not wait for the device-registration write", async () => {
    fetchVaultKeysMock.mockResolvedValue(keysFixture());
    // Registration write never settles — login must still complete.
    saveVaultKeysMock.mockReturnValue(new Promise(() => {}));

    await useVaultStore.getState().unlockOrBootstrap("pw");

    expect(useVaultStore.getState().status).toBe("unlocked");
  });

  it("a failed device-registration write leaves the session unlocked", async () => {
    fetchVaultKeysMock.mockResolvedValue(keysFixture());
    saveVaultKeysMock.mockRejectedValue(new Error("offline"));

    await useVaultStore.getState().unlockOrBootstrap("pw");
    // Let the backgrounded registration settle (and its rejection be handled).
    await new Promise((resolve) => setImmediate(resolve));

    expect(useVaultStore.getState().status).toBe("unlocked");
  });

  it("a wrong password locks with an error and rethrows", async () => {
    fetchVaultKeysMock.mockResolvedValue(keysFixture());
    vi.mocked(unlockVaultWithPassword).mockRejectedValue(new Error("bad key"));

    await expect(useVaultStore.getState().unlockOrBootstrap("nope")).rejects.toThrow();

    expect(useVaultStore.getState().status).toBe("locked");
    expect(useVaultStore.getState().error).toBe("bad key");
  });
});

describe("vault-store offline silent unlock", () => {
  // Wrapped-keys blob covering THIS device (getOrCreateDevice mock → dev-1).
  const deviceKeys = () => ({
    deviceWraps: [{ deviceId: "dev-1" }],
    passwordWrap: { scheme: "password", salt: "s" },
    vmkCheck: "enc:v1:x",
  });

  beforeEach(() => {
    vi.mocked(unlockVaultWithDevice).mockReset();
    vi.mocked(unlockVaultWithDevice).mockReturnValue(new Uint8Array([1, 2, 3]));
    offlineCacheMock.writeVaultKeys.mockClear();
    offlineCacheMock.readVaultKeys.mockReset();
    offlineCacheMock.readVaultKeys.mockResolvedValue(null);
    useConnectivityStore.setState({ isOnline: true });
  });

  it("writes the wrapped keys through to the sealed offline cache when online", async () => {
    const keys = deviceKeys();
    fetchVaultKeysMock.mockResolvedValue(keys);

    await expect(useVaultStore.getState().unlockSilently()).resolves.toBe(true);
    expect(useVaultStore.getState().status).toBe("unlocked");
    expect(offlineCacheMock.writeVaultKeys).toHaveBeenCalledWith(keys);
  });

  it("falls back to the sealed offline copy when the network fails", async () => {
    fetchVaultKeysMock.mockRejectedValue(new TypeError("fetch failed"));
    offlineCacheMock.readVaultKeys.mockResolvedValue(deviceKeys());

    await expect(useVaultStore.getState().unlockSilently()).resolves.toBe(true);
    expect(useVaultStore.getState().status).toBe("unlocked");
    expect(useConnectivityStore.getState().isOnline).toBe(false);
  });

  it("locks — never needs-setup — when the network fails and the cache is cold", async () => {
    fetchVaultKeysMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(useVaultStore.getState().unlockSilently()).resolves.toBe(false);
    // needs-setup would bounce the kid to /finish-setup; a network failure
    // must never be read as "this account has no vault".
    expect(useVaultStore.getState().status).toBe("locked");
  });
});
