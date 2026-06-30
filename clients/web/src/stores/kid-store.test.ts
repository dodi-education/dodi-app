import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reproduction for the kid-switcher "empty circle" bug.
 *
 * On a cold kid-view load the vault unlocks asynchronously (KidLayout fires
 * `unlockSilently()`), while the KidSwitcher mounts and immediately calls
 * `loadList()`. If the kids fetch resolves before the vault session is set,
 * the store throws "Vault is locked" and the kid list is never populated —
 * leaving `kids.length === 0` and the bare placeholder avatar forever.
 *
 * `loadList()` must be resilient to the session not being ready yet: it should
 * resolve with the kids once the vault finishes unlocking, not fail
 * permanently.
 */

// Minimal zustand-shaped mock of the vault store so the test can flip the
// session from locked -> unlocked and notify subscribers, exactly like the real
// store's getState/setState/subscribe.
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

vi.mock("@/stores/vault-store", () => ({ useVaultStore: vaultMock }));

// Passthrough crypto — we only care about list population, not field decryption.
vi.mock("@dodi/vault/kid-crypto", () => ({
  decryptKid: (_session: unknown, row: Record<string, unknown>) => ({
    ...row,
    display_name: row.display_name ?? "Kid",
  }),
}));

import { useKidStore } from "@/stores/kid-store";

const ROWS = [
  { id: "p1", display_name: "Ada", language: "en" },
  { id: "p2", display_name: "Bo", language: "de" },
];

describe("useKidStore.loadList — vault unlock race", () => {
  beforeEach(() => {
    vaultMock.reset();
    useKidStore.setState({ list: null, byId: {} });
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ROWS,
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("populates the list even when loadList runs before the vault is unlocked", async () => {
    // KidSwitcher's useKids() fires while unlockSilently() is still in
    // flight: the session is null at this point.
    const pending = useKidStore.getState().loadList();

    // Attach the assertion now so the promise has a handler before the vault
    // unlocks (avoids unhandled-rejection noise on the buggy code path).
    const assertion = expect(pending).resolves.toHaveLength(2);

    // Drain microtasks: on the buggy code path requireSession() has already
    // thrown by the time this macrotask runs.
    await new Promise((r) => setTimeout(r, 0));

    // The vault finishes unlocking only now.
    vaultMock.setState({ session: {}, status: "unlocked" });

    await assertion;
    expect(useKidStore.getState().list).toHaveLength(2);
  });

  it("rejects (does not hang) when the vault is already terminally locked", async () => {
    // Silent unlock failed before loadList was called: session is null and the
    // status has already settled — no future state change will arrive.
    vaultMock.setState({ session: null, status: "locked" });

    await expect(useKidStore.getState().loadList()).rejects.toThrow(
      "Vault is locked",
    );
  });
});
