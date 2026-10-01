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
}));

import { unlockVaultWithDevice, unlockVaultWithPassword } from "@dodi/vault";

import { createConnectivityStore, type ConnectivityStore } from "./connectivity-store";
import { createVaultStore, type VaultStore } from "./vault-store";

let store: VaultStore;
let connectivity: ConnectivityStore;

beforeEach(() => {
  sealedRef.current = null;
  connectivity = createConnectivityStore(true);
  store = createVaultStore({
    api: {
      request: () => Promise.reject(new Error("unused")),
      getVaultKeys: fetchVaultKeysMock,
      putVaultKeys: saveVaultKeysMock,
    },
    deviceKeystore: {} as never,
    offlineCache: offlineCacheMock as never,
    // In-memory stand-in for the device-local seal: single-use, a read wipes.
    registrationSeal: {
      stash: async (secret) => {
        sealedRef.current = secret;
      },
      consume: async () => {
        const value = sealedRef.current;
        sealedRef.current = null;
        return value;
      },
      clear: async () => {
        sealedRef.current = null;
      },
    },
    parentLock: { markUnlocked: vi.fn(), clear: vi.fn() },
    connectivity,
  });
  saveVaultKeysMock.mockReset();
  saveVaultKeysMock.mockResolvedValue(undefined);
  fetchVaultKeysMock.mockReset();
  fetchVaultKeysMock.mockResolvedValue(null);
  store.setState({
    status: "idle",
    session: null,
    pendingNsec: null,
    pendingVault: null,
    error: null,
  });
});

describe("vault-store register split", () => {
  it("createLocalVault seals the vault and writes nothing to the server", async () => {
    await store.getState().createLocalVault("parent@example.com", "hunter2-password");

    expect(saveVaultKeysMock).not.toHaveBeenCalled();
    expect(sealedRef.current).toBeTruthy();
    const parsed = JSON.parse(sealedRef.current!);
    expect(parsed.nsec).toBe(MOCK_NSEC);
    expect(parsed.storedKeys.passwordWrap).toBeTruthy();
    // No session, no status flip while still on public /register.
    expect(store.getState().session).toBeNull();
    expect(store.getState().status).toBe("idle");
  });

  it("finalizeVault persists once (with the npub bind), activates the session, reveals the nsec", async () => {
    await store.getState().createLocalVault("parent@example.com", "hunter2-password");
    await store.getState().finalizeVault();

    expect(saveVaultKeysMock).toHaveBeenCalledTimes(1);
    expect(saveVaultKeysMock).toHaveBeenCalledWith(
      expect.objectContaining({ vmkCheck: "enc:v1:x" }),
      { npub: MOCK_NPUB_HEX },
    );
    const s = store.getState();
    expect(s.status).toBe("unlocked");
    expect(s.pendingNsec).toBe(MOCK_NSEC);
    expect(s.session).not.toBeNull();
    expect(s.pendingVault).toBeNull();
    expect(sealedRef.current).toBeNull(); // seal cleared after success
  });

  it("bootstrap saves the keys with the npub bind and reveals the nsec", async () => {
    await store.getState().bootstrap("hunter2-password");

    expect(saveVaultKeysMock).toHaveBeenCalledWith(
      expect.objectContaining({ vmkCheck: "enc:v1:x" }),
      { npub: MOCK_NPUB_HEX },
    );
    const s = store.getState();
    expect(s.status).toBe("unlocked");
    expect(s.pendingNsec).toBe(MOCK_NSEC);
  });

  it("retries via pendingVault when saveVaultKeys fails, without re-consuming the seal", async () => {
    await store.getState().createLocalVault("parent@example.com", "hunter2-password");

    saveVaultKeysMock.mockRejectedValueOnce(new Error("network"));
    await expect(store.getState().finalizeVault()).rejects.toThrow();

    // Seal was consumed on the first attempt, but the data is retained in memory.
    expect(sealedRef.current).toBeNull();
    expect(store.getState().pendingVault).not.toBeNull();

    await store.getState().finalizeVault();
    expect(saveVaultKeysMock).toHaveBeenCalledTimes(2);
    expect(store.getState().status).toBe("unlocked");
  });

  it("finalizeVault throws when there is no seal and no pending vault", async () => {
    await expect(store.getState().finalizeVault()).rejects.toThrow(
      /registration-seal-missing/,
    );
  });

  it("discardLocalVault clears the seal and the pending vault", async () => {
    await store.getState().createLocalVault("parent@example.com", "hunter2-password");
    store.setState({
      pendingVault: { storedKeys: {} as never, nsec: "x" },
    });

    await store.getState().discardLocalVault();
    expect(sealedRef.current).toBeNull();
    expect(store.getState().pendingVault).toBeNull();
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

    const { created } = await store.getState().unlockOrBootstrap("pw");

    expect(created).toBe(false);
    expect(store.getState().status).toBe("unlocked");
    expect(fetchVaultKeysMock).toHaveBeenCalledTimes(1);
    expect(unlockVaultWithPassword).toHaveBeenCalledWith(keys, "pw");
  });

  it("unlock does not wait for the device-registration write", async () => {
    fetchVaultKeysMock.mockResolvedValue(keysFixture());
    // Registration write never settles — login must still complete.
    saveVaultKeysMock.mockReturnValue(new Promise(() => {}));

    await store.getState().unlockOrBootstrap("pw");

    expect(store.getState().status).toBe("unlocked");
  });

  it("a failed device-registration write leaves the session unlocked", async () => {
    fetchVaultKeysMock.mockResolvedValue(keysFixture());
    saveVaultKeysMock.mockRejectedValue(new Error("offline"));

    await store.getState().unlockOrBootstrap("pw");
    // Let the backgrounded registration settle (and its rejection be handled).
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(store.getState().status).toBe("unlocked");
  });

  it("a wrong password locks with an error and rethrows", async () => {
    fetchVaultKeysMock.mockResolvedValue(keysFixture());
    vi.mocked(unlockVaultWithPassword).mockRejectedValue(new Error("bad key"));

    await expect(store.getState().unlockOrBootstrap("nope")).rejects.toThrow();

    expect(store.getState().status).toBe("locked");
    expect(store.getState().error).toBe("bad key");
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
    connectivity.setState({ isOnline: true });
  });

  it("writes the wrapped keys through to the sealed offline cache when online", async () => {
    const keys = deviceKeys();
    fetchVaultKeysMock.mockResolvedValue(keys);

    await expect(store.getState().unlockSilently()).resolves.toBe(true);
    expect(store.getState().status).toBe("unlocked");
    expect(offlineCacheMock.writeVaultKeys).toHaveBeenCalledWith(keys);
  });

  it("falls back to the sealed offline copy when the network fails", async () => {
    fetchVaultKeysMock.mockRejectedValue(new TypeError("fetch failed"));
    offlineCacheMock.readVaultKeys.mockResolvedValue(deviceKeys());

    await expect(store.getState().unlockSilently()).resolves.toBe(true);
    expect(store.getState().status).toBe("unlocked");
    expect(connectivity.getState().isOnline).toBe(false);
  });

  it("locks — never needs-setup — when the network fails and the cache is cold", async () => {
    fetchVaultKeysMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(store.getState().unlockSilently()).resolves.toBe(false);
    // needs-setup would bounce the kid to /finish-setup; a network failure
    // must never be read as "this account has no vault".
    expect(store.getState().status).toBe("locked");
  });
});

/**
 * An interrupted registration (the emailed code entered only on a later
 * sign-in) must not cost the parent their account key. The vault sealed at
 * registration is adopted on that first sign-in, so an imported nsec survives.
 */
describe("unlockOrBootstrap adopts an interrupted registration", () => {
  const EMAIL = "parent@example.com";

  it("persists the sealed vault instead of minting a new identity", async () => {
    await store
      .getState()
      .createLocalVault(EMAIL, "hunter2-password", MOCK_NSEC);
    expect(saveVaultKeysMock).not.toHaveBeenCalled();

    const { created } = await store
      .getState()
      .unlockOrBootstrap("hunter2-password", EMAIL);

    expect(created).toBe(true);
    expect(saveVaultKeysMock).toHaveBeenCalledTimes(1);
    // The adopted vault is the sealed one, so the account keeps its nsec.
    expect(store.getState().pendingNsec).toBe(MOCK_NSEC);
    expect(saveVaultKeysMock.mock.calls[0][1]).toEqual({ npub: MOCK_NPUB_HEX });
    expect(store.getState().status).toBe("unlocked");
    expect(sealedRef.current).toBeNull();
  });

  it("never adopts a seal left by a different account", async () => {
    await store
      .getState()
      .createLocalVault("someone-else@example.com", "hunter2-password", MOCK_NSEC);

    const { created } = await store
      .getState()
      .unlockOrBootstrap("hunter2-password", EMAIL);

    // A fresh vault is generated for this account, and the foreign seal is gone.
    expect(created).toBe(true);
    expect(sealedRef.current).toBeNull();
    expect(store.getState().status).toBe("unlocked");
  });

  it("unlocks normally when the account already has a stored vault", async () => {
    vi.mocked(unlockVaultWithPassword).mockReset();
    vi.mocked(unlockVaultWithPassword).mockResolvedValue(new Uint8Array([1, 2, 3]));
    fetchVaultKeysMock.mockResolvedValue({
      deviceWraps: [{ deviceId: "dev-1" }],
      passwordWrap: { scheme: "password", salt: "s" },
      vmkCheck: "enc:v1:x",
    });
    await store
      .getState()
      .createLocalVault(EMAIL, "hunter2-password", MOCK_NSEC);

    const { created } = await store
      .getState()
      .unlockOrBootstrap("hunter2-password", EMAIL);

    expect(created).toBe(false);
    expect(saveVaultKeysMock).not.toHaveBeenCalled();
  });
});
