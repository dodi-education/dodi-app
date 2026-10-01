import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The game cache is the single point where E2EE game rows become readable, so
 * these cover the three things that would silently break the whole feature:
 * decrypt-once, one fetch per key (single flight), and surviving the cold-load
 * window where the kid layout's silent unlock is still in flight.
 */

// Minimal zustand-shaped mock of the vault store so the test can flip the
// session from locked -> unlocked and notify subscribers.
const { vaultMock } = vi.hoisted(() => {
  let state: { session: unknown; status: string } = {
    session: null,
    status: "working",
  };
  const listeners = new Set<(s: typeof state, p: typeof state) => void>();
  return {
    vaultMock: {
      getState: () => state,
      setState: (partial: Partial<typeof state>) => {
        const prev = state;
        state = { ...state, ...partial };
        listeners.forEach((l) => l(state, prev));
      },
      subscribe: (fn: (s: typeof state, p: typeof state) => void) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      reset: () => {
        // "working" models the cold-load window: the silent unlock is in
        // flight (non-terminal), so awaitSession waits rather than rejecting.
        state = { session: null, status: "working" };
        listeners.clear();
      },
    },
  };
});

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));

// Controllable stand-in for the IndexedDB offline cache (absent in node).
const { offlineCacheMock } = vi.hoisted(() => ({
  offlineCacheMock: {
    writeGameRows: vi.fn(async () => {}),
    readGameRows: vi.fn(async (): Promise<unknown[] | null> => null),
  },
}));

vi.mock("@/stores/vault-store", () => ({ useVaultStore: vaultMock }));
vi.mock("@/lib/api", () => ({ dodi: { request: requestMock } }));
vi.mock("@/lib/offline/offline-cache", () => ({
  offlineCache: offlineCacheMock,
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

import { useConnectivityStore } from "@/stores/connectivity-store";
import { useGameStore } from "@/stores/game-store";

function ok(body: unknown) {
  return { ok: true, json: async () => body };
}

const KID_ROWS = [
  { id: "g1", title: "sealed:Counting Comets", is_favorite: false },
  { id: "g2", title: "sealed:Word Wagon", is_favorite: true },
];

describe("useGameStore", () => {
  beforeEach(() => {
    vaultMock.reset();
    useGameStore.setState({ byKid: {}, account: null, byId: {} });
    requestMock.mockReset();
    offlineCacheMock.writeGameRows.mockClear();
    offlineCacheMock.readGameRows.mockReset();
    offlineCacheMock.readGameRows.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useConnectivityStore.setState({ isOnline: true });
  });

  it("decrypts the kid library once and serves the cache afterwards", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    vaultMock.setState({ session: {}, status: "unlocked" });

    const first = await useGameStore.getState().loadForKid("k1");
    expect(first.map((g) => g.title)).toEqual(["Counting Comets", "Word Wagon"]);
    expect(first[1].is_favorite).toBe(true);

    await useGameStore.getState().loadForKid("k1");
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("populates the library even when the load starts before the vault unlocks", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));

    // The library mounts while unlockSilently() is still in flight.
    const pending = useGameStore.getState().loadForKid("k1");
    const assertion = expect(pending).resolves.toHaveLength(2);
    await new Promise((r) => setTimeout(r, 0));

    vaultMock.setState({ session: {}, status: "unlocked" });

    await assertion;
    expect(useGameStore.getState().byKid.k1?.[0].title).toBe("Counting Comets");
  });

  it("rejects (does not hang) when the vault is already terminally locked", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    vaultMock.setState({ session: null, status: "locked" });

    await expect(useGameStore.getState().loadForKid("k1")).rejects.toThrow(
      "Vault is locked",
    );
  });

  it("rides one fetch when concurrent callers ask for the same library", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    vaultMock.setState({ session: {}, status: "unlocked" });

    const [a, b] = await Promise.all([
      useGameStore.getState().loadForKid("k1"),
      useGameStore.getState().loadForKid("k1"),
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
    vaultMock.setState({ session: {}, status: "unlocked" });

    const forKid = await useGameStore.getState().loadOne("g1", "k1");
    const forParent = await useGameStore.getState().loadOne("g1");
    expect(forKid?.title).toBe("Zeichnen");
    expect(forParent?.title).toBe("Drawing");
  });

  it("propagates a patch to every cached copy of the row", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    vaultMock.setState({ session: {}, status: "unlocked" });
    await useGameStore.getState().loadForKid("k1");

    useGameStore.getState().patchLocal("g1", { is_favorite: true });
    expect(useGameStore.getState().byKid.k1?.[0].is_favorite).toBe(true);
    expect(useGameStore.getState().byId.g1?.title).toBe("Counting Comets");
  });

  it("returns null for a game the platform refuses to serve", async () => {
    requestMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    vaultMock.setState({ session: {}, status: "unlocked" });

    await expect(useGameStore.getState().loadOne("nope", "k1")).resolves.toBeNull();
  });

  it("writes the ciphertext rows through to the offline cache on a successful load", async () => {
    requestMock.mockResolvedValue(ok(KID_ROWS));
    vaultMock.setState({ session: {}, status: "unlocked" });

    await useGameStore.getState().loadForKid("k1");
    expect(offlineCacheMock.writeGameRows).toHaveBeenCalledWith("k1", KID_ROWS);
  });

  it("serves the cached ciphertext library when the network is unreachable", async () => {
    requestMock.mockRejectedValue(new TypeError("fetch failed"));
    offlineCacheMock.readGameRows.mockResolvedValue(KID_ROWS);
    vaultMock.setState({ session: {}, status: "unlocked" });

    const games = await useGameStore.getState().loadForKid("k1");
    expect(games.map((g) => g.title)).toEqual([
      "Counting Comets",
      "Word Wagon",
    ]);
    expect(useConnectivityStore.getState().isOnline).toBe(false);
  });

  it("resolves an offline deep-link from the cached library rows", async () => {
    requestMock.mockRejectedValue(new TypeError("fetch failed"));
    offlineCacheMock.readGameRows.mockResolvedValue(KID_ROWS);
    vaultMock.setState({ session: {}, status: "unlocked" });

    const game = await useGameStore.getState().loadOne("g2", "k1");
    expect(game?.title).toBe("Word Wagon");
  });

  it("rethrows when the network is unreachable and the cache is cold", async () => {
    requestMock.mockRejectedValue(new TypeError("fetch failed"));
    vaultMock.setState({ session: {}, status: "unlocked" });

    await expect(useGameStore.getState().loadForKid("k1")).rejects.toThrow(
      "fetch failed",
    );
  });

  it("does NOT fall back to the cache on an HTTP error (auth/server problems)", async () => {
    requestMock.mockResolvedValue({ ok: false, json: async () => ({}) });
    offlineCacheMock.readGameRows.mockResolvedValue(KID_ROWS);
    vaultMock.setState({ session: {}, status: "unlocked" });

    await expect(useGameStore.getState().loadForKid("k1")).rejects.toThrow(
      "Failed to load games",
    );
    expect(useConnectivityStore.getState().isOnline).toBe(true);
  });
});
