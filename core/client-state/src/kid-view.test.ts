import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStore } from "zustand/vanilla";

import type { Kid } from "@dodi/types/database";
import { VaultSession } from "@dodi/vault";

import { createActiveKidStore } from "./active-kid-store";
import { AVATAR_IDS, PIN_PALETTE, friendAvatarColor, readAvatarConfig } from "./avatars";
import type { KidStore, KidStoreState } from "./kid-store";
import {
  createCardRefreshScheduler,
  enterKidView,
  isCompanionInError,
  kidPickAction,
  onKidViewMount,
  parseAvatarPin,
  refreshKidHome,
  solvedPinAction,
  switchActiveKid,
  updateKidLook,
  verifyAvatarPin,
} from "./kid-view";
import type { ActiveKidPersistence, PlatformApi } from "./platform";
import type { ProvidersStore } from "./providers-store";
import type { VaultState, VaultStore } from "./vault-store";

function kid(id: string, extra: Partial<Kid> = {}): Kid {
  return { id, avatar_pin: null, language: "en", avatar_config: null, ...extra } as Kid;
}

function kidStore(load: () => Promise<Kid[]>): KidStore & { patchLocal: ReturnType<typeof vi.fn> } {
  const patchLocal = vi.fn();
  const store = createStore(
    () => ({ list: null, byId: {}, loadList: load, patchLocal }) as unknown as KidStoreState,
  ) as KidStore;
  return Object.assign(store, { patchLocal });
}

function persistence(initial: string | null = null) {
  let id = initial;
  const writes: Array<{ id: string; language: string | null }> = [];
  const p: Pick<ActiveKidPersistence, "readActiveKidId" | "writeActiveKid"> = {
    readActiveKidId: () => id,
    writeActiveKid: (k) => {
      id = k.id;
      writes.push(k);
    },
  };
  return { p, writes };
}

function vaultWith(session: VaultSession | null, status: VaultState["status"] = "unlocked") {
  const unlockSilently = vi.fn(async () => true);
  const vault = createStore(() => ({ session, status, unlockSilently }) as unknown as VaultState) as VaultStore;
  return { vault, unlockSilently };
}

describe("avatars", () => {
  it("reads a look defensively (object, JSON string, junk) and clamps the color", () => {
    expect(readAvatarConfig({ color: 2, avatar: "animal_cat" })).toEqual({ color: 2, avatar: "animal_cat" });
    expect(readAvatarConfig('{"color":9,"avatar":"dino_trex"}')).toEqual({ color: 5, avatar: "dino_trex" });
    expect(readAvatarConfig("nope")).toEqual({ color: 0, avatar: null });
    expect(readAvatarConfig(null)).toEqual({ color: 0, avatar: null });
  });

  it("keeps the PIN palette inside the avatar library, and friend colors stable per label", () => {
    expect(PIN_PALETTE.every((id) => AVATAR_IDS.includes(id))).toBe(true);
    expect(friendAvatarColor("Mia")).toEqual(friendAvatarColor("Mia"));
  });
});

describe("enterKidView", () => {
  it("keeps the last-used kid, persists it with its language, and re-locks the parent area", async () => {
    const kids = [kid("a"), kid("b", { language: "de" })];
    const { p, writes } = persistence("b");
    const parentLock = { markUnlocked: vi.fn(), clear: vi.fn() };
    const picked = await enterKidView({ kids: kidStore(async () => kids), persistence: p, parentLock });
    expect(picked?.id).toBe("b");
    expect(writes).toEqual([{ id: "b", language: "de" }]);
    expect(parentLock.clear).toHaveBeenCalledOnce();
  });

  it("falls back to the first kid, and still switches when the list can't load", async () => {
    const { p, writes } = persistence("gone");
    const parentLock = { markUnlocked: vi.fn(), clear: vi.fn() };
    await enterKidView({ kids: kidStore(async () => [kid("a"), kid("b")]), persistence: p, parentLock });
    expect(writes[0].id).toBe("a");

    const failing = persistence();
    const picked = await enterKidView({
      kids: kidStore(async () => {
        throw new Error("locked");
      }),
      persistence: failing.p,
      parentLock,
    });
    expect(picked).toBeNull();
    expect(failing.writes).toEqual([]);
    expect(parentLock.clear).toHaveBeenCalledTimes(2);
  });
});

describe("onKidViewMount", () => {
  it("re-locks the parent area and opens a closed vault silently", () => {
    const parentLock = { markUnlocked: vi.fn(), clear: vi.fn() };
    const closed = vaultWith(null, "idle");
    onKidViewMount({ parentLock, vault: closed.vault });
    expect(parentLock.clear).toHaveBeenCalledOnce();
    expect(closed.unlockSilently).toHaveBeenCalledOnce();

    const open = vaultWith(new VaultSession(new Uint8Array(32).fill(1)));
    onKidViewMount({ parentLock, vault: open.vault });
    expect(open.unlockSilently).not.toHaveBeenCalled();
  });
});

describe("avatar PIN", () => {
  const locked = kid("a", { avatar_pin: '["animal_cat","animal_dog","animal_fox"]' });

  it("parses only a 3-avatar sequence", () => {
    expect(parseAvatarPin(locked)).toEqual(["animal_cat", "animal_dog", "animal_fox"]);
    expect(parseAvatarPin(kid("b", { avatar_pin: '["a","b"]' }))).toBeNull();
    expect(parseAvatarPin(kid("c", { avatar_pin: "{" }))).toBeNull();
    expect(parseAvatarPin(kid("d"))).toBeNull();
  });

  it("verifies the exact order, and never without a PIN", () => {
    expect(verifyAvatarPin(locked, ["animal_cat", "animal_dog", "animal_fox"])).toBe(true);
    expect(verifyAvatarPin(locked, ["animal_dog", "animal_cat", "animal_fox"])).toBe(false);
    expect(verifyAvatarPin(kid("x"), ["animal_cat", "animal_dog", "animal_fox"])).toBe(false);
  });

  it("decides what tapping a kid does", () => {
    const none = new Set<string>();
    expect(kidPickAction(kid("a"), { activeKidId: "a", needsPin: false, unlockedKidIds: none })).toBe("none");
    expect(kidPickAction(locked, { activeKidId: "a", needsPin: true, unlockedKidIds: none })).toBe("puzzle");
    expect(kidPickAction(locked, { activeKidId: "z", needsPin: false, unlockedKidIds: new Set(["a"]) })).toBe(
      "switch",
    );
    expect(kidPickAction(kid("b"), { activeKidId: "a", needsPin: false, unlockedKidIds: none })).toBe("switch");
    expect(solvedPinAction("a", "a")).toBe("unlock");
    expect(solvedPinAction("b", "a")).toBe("switch");
  });

  it("switching ends the voice session, then persists and unlocks the kid", () => {
    const store = createActiveKidStore({
      readActiveKidId: () => null,
      writeActiveKid: () => {},
      readUnlockedKidIds: () => new Set(),
      writeUnlockedKidIds: () => {},
    });
    const order: string[] = [];
    store.subscribe(() => order.push("set"));
    switchActiveKid({ activeKid: store, endVoiceSession: () => order.push("end") }, locked);
    expect(order).toEqual(["end", "set"]);
    expect(store.getState().activeKidId).toBe("a");
    expect(store.getState().unlockedKidIds.has("a")).toBe(true);
  });
});

describe("updateKidLook", () => {
  it("patches locally and PATCHes the sealed avatar_config", async () => {
    const session = new VaultSession(new Uint8Array(32).fill(3));
    const request = vi.fn(async () => new Response("{}"));
    const api = { request } as unknown as PlatformApi;
    const kids = kidStore(async () => []);
    const k = kid("k1", { avatar_config: { color: 1, avatar: "animal_cat" } });

    expect(updateKidLook({ api, kids, vault: vaultWith(session).vault }, k, { avatar: "dino_trex" })).toBe(true);
    expect(kids.patchLocal).toHaveBeenCalledWith("k1", { avatar_config: { color: 1, avatar: "dino_trex" } });
    const [path, init] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/kids/k1");
    expect(init.method).toBe("PATCH");
    const sealed = (JSON.parse(init.body as string) as { avatar_config: string }).avatar_config;
    expect(sealed.startsWith("enc:v1:")).toBe(true);
    expect(sealed).not.toContain("dino_trex");
  });

  it("only patches locally while the vault is locked", () => {
    const request = vi.fn();
    const kids = kidStore(async () => []);
    const sent = updateKidLook(
      { api: { request } as unknown as PlatformApi, kids, vault: vaultWith(null, "locked").vault },
      kid("k1"),
      { color: 3 },
    );
    expect(sent).toBe(false);
    expect(kids.patchLocal).toHaveBeenCalledWith("k1", { avatar_config: { color: 3, avatar: null } });
    expect(request).not.toHaveBeenCalled();
  });
});

describe("createCardRefreshScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces rapid taps into one refresh, and flushes a pending one at once", () => {
    const refresh = vi.fn();
    const s = createCardRefreshScheduler(refresh, 1200);
    s.schedule("k1");
    vi.advanceTimersByTime(800);
    s.schedule("k1");
    vi.advanceTimersByTime(800);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(refresh).toHaveBeenCalledExactlyOnceWith("k1");

    s.schedule("k2");
    s.flush();
    expect(refresh).toHaveBeenLastCalledWith("k2");
    s.flush();
    vi.advanceTimersByTime(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("refreshKidHome (pull to refresh)", () => {
  type Companion = { state: "disconnected" | "active" | "sleep"; error: string | null; fatalError: boolean };

  function setup(opts: { providers: () => Promise<Record<string, unknown>>; companion: Companion }) {
    const load = vi.fn(opts.providers);
    const connect = vi.fn(async () => {});
    const deps = {
      providers: createStore(() => ({ load })) as unknown as ProvidersStore,
      companion: { getState: () => ({ ...opts.companion, connect }) },
    };
    return { deps, load, connect };
  }

  it("reloads the provider keys past the cache and reports whether one is set up", async () => {
    const { deps, load, connect } = setup({
      providers: async () => ({ xai: { apiKey: "k" } }),
      companion: { state: "active", error: null, fatalError: false },
    });
    await expect(refreshKidHome(deps, "k1")).resolves.toBe(true);
    expect(load).toHaveBeenCalledWith(true);
    expect(connect).not.toHaveBeenCalled();
  });

  it("retries dodi's connection when it is stuck in an error, like Tap to retry", async () => {
    const { deps, connect } = setup({
      providers: async () => ({ xai: { apiKey: "k" } }),
      companion: { state: "disconnected", error: "Failed to start voice", fatalError: true },
    });
    await refreshKidHome(deps, "k1");
    expect(connect).toHaveBeenCalledWith("k1");
  });

  it("does not connect without a provider, or when dodi is merely idle or asleep", async () => {
    const noProvider = setup({
      providers: async () => ({}),
      companion: { state: "disconnected", error: "boom", fatalError: true },
    });
    await expect(refreshKidHome(noProvider.deps, "k1")).resolves.toBe(false);
    expect(noProvider.connect).not.toHaveBeenCalled();

    for (const companion of [
      { state: "disconnected", error: null, fatalError: false },
      { state: "sleep", error: null, fatalError: false },
    ] as Companion[]) {
      const idle = setup({ providers: async () => ({ xai: {} }), companion });
      await refreshKidHome(idle.deps, "k1");
      expect(idle.connect).not.toHaveBeenCalled();
    }
  });

  it("resolves null (keep what's shown) when the keys can't be loaded, and never throws", async () => {
    const { deps, connect } = setup({
      providers: async () => {
        throw new TypeError("Network request failed");
      },
      companion: { state: "disconnected", error: "boom", fatalError: true },
    });
    await expect(refreshKidHome(deps, "k1")).resolves.toBeNull();
    expect(connect).not.toHaveBeenCalled();
  });

  it("isCompanionInError: disconnected with an error or a fatal flag only", () => {
    expect(isCompanionInError({ state: "disconnected", error: "x", fatalError: false })).toBe(true);
    expect(isCompanionInError({ state: "disconnected", error: null, fatalError: true })).toBe(true);
    expect(isCompanionInError({ state: "disconnected", error: null, fatalError: false })).toBe(false);
    expect(isCompanionInError({ state: "active", error: "micPermissionNeeded", fatalError: false })).toBe(false);
  });
});
