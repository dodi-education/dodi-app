import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The game cache is the single point where E2EE game rows become readable, so
 * these cover the three things that would silently break the whole feature:
 * decrypt-once, one fetch per key (single flight), and surviving the cold-load
 * window where the kid layout's silent unlock is still in flight.
 */

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

// Controllable stand-in for the IndexedDB offline cache (absent in node).
const { offlineCacheMock } = vi.hoisted(() => ({
  offlineCacheMock: {
    writeGameRows: vi.fn(async () => {}),
    readGameRows: vi.fn(async (): Promise<unknown[] | null> => null),
  },
}));


// Stand-in crypto: strips a "sealed:" prefix so the tests can assert that the
// store, and only the store, is what turns ciphertext into readable fields.
vi.mock("@dodi/vault/game-crypto", () => ({
  decryptGame: (_s: unknown, row: Record<string, unknown>) => ({
    ...row,
    title: String(row.title).replace(/^sealed:/, ""),
  }),
  decryptGameVersion: (_s: unknown, row: Record<string, unknown>) => ({
    ...row,
    code_bundle: String(row.code_bundle).replace(/^sealed:/, ""),
  }),
  encryptGameFields: (_s: unknown, f: unknown) => f,
  encryptGameCreateFields: (_s: unknown, f: unknown) => f,
}));

import { createStore } from "zustand/vanilla";

import { createConnectivityStore, type ConnectivityStore } from "./connectivity-store";
import { createGameStore } from "./game-store";
import type { VaultSession } from "@dodi/vault";

import type { VaultState, VaultStore } from "./vault-store";

/** A vault the test drives: "working" models the cold-load window (unlock in flight). */
function testVault(): VaultStore {
  return createStore(() => ({ session: null, status: "working" }) as unknown as VaultState);
}

let vault: VaultStore;
let connectivity: ConnectivityStore;
/** The silent unlock finishes (the stand-in crypto never touches the session). */
function unlock(): void {
  vault.setState({ session: {} as VaultSession, status: "unlocked" });
}

let store: ReturnType<typeof createGameStore>;

function ok(body: unknown) {
  return { ok: true, json: async () => body };
}

const KID_ROWS = [
  { id: "g1", title: "sealed:Counting Comets", is_favorite: false },
  { id: "g2", title: "sealed:Word Wagon", is_favorite: true },
];

describe("useGameStore", () => {
  beforeEach(() => {
    vault = testVault();
    connectivity = createConnectivityStore(true);
    store = createGameStore({
      api: { request: requestMock } as never,
      offlineCache: offlineCacheMock as never,
      vault,
      connectivity,
    });
    requestMock.mockReset();
    offlineCacheMock.writeGameRows.mockClear();
    offlineCacheMock.readGameRows.mockReset();
    offlineCacheMock.readGameRows.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("decrypts the kid library once and serves the cache afterwards", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    unlock();

    const first = await store.getState().loadForKid("k1");
    expect(first.map((g) => g.title)).toEqual(["Counting Comets", "Word Wagon"]);
    expect(first[1].is_favorite).toBe(true);

    await store.getState().loadForKid("k1");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("populates the library even when the load starts before the vault unlocks", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));

    // The library mounts while unlockSilently() is still in flight.
    const pending = store.getState().loadForKid("k1");
    const assertion = expect(pending).resolves.toHaveLength(2);
    await new Promise((r) => setTimeout(r, 0));

    unlock();

    await assertion;
    expect(store.getState().byKid.k1?.[0].title).toBe("Counting Comets");
  });

  it("rejects (does not hang) when the vault is already terminally locked", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    vault.setState({ session: null, status: "locked" });

    await expect(store.getState().loadForKid("k1")).rejects.toThrow(
      "Vault is locked",
    );
  });

  it("rides one fetch when concurrent callers ask for the same library", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    unlock();

    const [a, b] = await Promise.all([
      store.getState().loadForKid("k1"),
      store.getState().loadForKid("k1"),
    ]);
    expect(requestMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it("keeps a kid-scoped read separate from the parent's unscoped one", async () => {
    // The platform localizes a system game per kid, so the same id can legitimately
    // carry different content per audience — the cache must not collapse them.
    requestMock.mockImplementation((url: string) =>
      Promise.resolve(
        ok(
          url.includes("kidId")
            ? { id: "g1", title: "sealed:Zeichnen" }
            : { id: "g1", title: "sealed:Drawing" },
        ),
      ),
    );
    unlock();

    const forKid = await store.getState().loadOne("g1", "k1");
    const forParent = await store.getState().loadOne("g1");
    expect(forKid?.title).toBe("Zeichnen");
    expect(forParent?.title).toBe("Drawing");
  });

  it("propagates a patch to every cached copy of the row", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    unlock();
    await store.getState().loadForKid("k1");

    store.getState().patchLocal("g1", { is_favorite: true });
    expect(store.getState().byKid.k1?.[0].is_favorite).toBe(true);
    expect(store.getState().byId.g1?.title).toBe("Counting Comets");
  });

  it("returns null for a game the platform refuses to serve", async () => {
    requestMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    unlock();

    await expect(store.getState().loadOne("nope", "k1")).resolves.toBeNull();
  });

  it("writes the ciphertext rows through to the offline cache on a successful load", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    unlock();

    await store.getState().loadForKid("k1");
    expect(offlineCacheMock.writeGameRows).toHaveBeenCalledWith("k1", KID_ROWS);
  });

  it("serves the cached ciphertext library when the network is unreachable", async () => {
    requestMock.mockRejectedValue(new TypeError("fetch failed"));
    offlineCacheMock.readGameRows.mockResolvedValue(KID_ROWS);
    unlock();

    const games = await store.getState().loadForKid("k1");
    expect(games.map((g) => g.title)).toEqual([
      "Counting Comets",
      "Word Wagon",
    ]);
    expect(connectivity.getState().isOnline).toBe(false);
  });

  it("resolves an offline deep-link from the cached library rows", async () => {
    requestMock.mockRejectedValue(new TypeError("fetch failed"));
    offlineCacheMock.readGameRows.mockResolvedValue(KID_ROWS);
    unlock();

    const game = await store.getState().loadOne("g2", "k1");
    expect(game?.title).toBe("Word Wagon");
  });

  it("rethrows when the network is unreachable and the cache is cold", async () => {
    requestMock.mockRejectedValue(new TypeError("fetch failed"));
    unlock();

    await expect(store.getState().loadForKid("k1")).rejects.toThrow(
      "fetch failed",
    );
  });

  it("does NOT fall back to the cache on an HTTP error (auth/server problems)", async () => {
    requestMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    offlineCacheMock.readGameRows.mockResolvedValue(KID_ROWS);
    unlock();

    await expect(store.getState().loadForKid("k1")).rejects.toThrow(
      "Failed to load games",
    );
    expect(connectivity.getState().isOnline).toBe(true);
  });
});
