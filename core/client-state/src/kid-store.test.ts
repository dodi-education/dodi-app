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

// Passthrough crypto — we only care about list population, not field decryption.
vi.mock("@dodi/vault/kid-crypto", () => ({
  decryptKid: (_session: unknown, row: Record<string, unknown>) => ({
    ...row,
    display_name: row.display_name ?? "Kid",
  }),
}));

import { createStore } from "zustand/vanilla";

import { createConnectivityStore, type ConnectivityStore } from "./connectivity-store";
import { createKidStore } from "./kid-store";
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

let store: ReturnType<typeof createKidStore>;

const ROWS = [
  { id: "p1", display_name: "Ada", language: "en" },
  { id: "p2", display_name: "Bo", language: "de" },
];

describe("kid store loadList — vault unlock race", () => {
  beforeEach(() => {
    vault = testVault();
    connectivity = createConnectivityStore(true);
    const request = vi.fn(async () => ({ ok: true, json: async () => ROWS }));
    store = createKidStore({
      api: { request } as never,
      offlineCache: { writeKidRows: async () => {}, readKidRows: async () => null } as never,
      vault,
      connectivity,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("populates the list even when loadList runs before the vault is unlocked", async () => {
    // KidSwitcher's useKids() fires while unlockSilently() is still in
    // flight: the session is null at this point.
    const pending = store.getState().loadList();

    // Attach the assertion now so the promise has a handler before the vault
    // unlocks (avoids unhandled-rejection noise on the buggy code path).
    const assertion = expect(pending).resolves.toHaveLength(2);

    // Drain microtasks: on the buggy code path requireSession() has already
    // thrown by the time this macrotask runs.
    await new Promise((r) => setTimeout(r, 0));

    // The vault finishes unlocking only now.
    unlock();

    await assertion;
    expect(store.getState().list).toHaveLength(2);
  });

  it("rejects (does not hang) when the vault is already terminally locked", async () => {
    // Silent unlock failed before loadList was called: session is null and the
    // status has already settled — no future state change will arrive.
    vault.setState({ session: null, status: "locked" });

    await expect(store.getState().loadList()).rejects.toThrow(
      "Vault is locked",
    );
  });
});
