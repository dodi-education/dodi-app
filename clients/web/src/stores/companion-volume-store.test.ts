import { beforeEach, describe, expect, it } from "vitest";

import {
  readKidVolume,
  useCompanionVolumeStore,
} from "./companion-volume-store";

function makeLocalStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
}

beforeEach(() => {
  (globalThis as { window?: unknown }).window = {
    localStorage: makeLocalStorage(),
  };
  (globalThis as { localStorage?: unknown }).localStorage =
    (globalThis as { window: { localStorage: unknown } }).window.localStorage;
  useCompanionVolumeStore.setState({ kidId: null, volume: 1 });
});

describe("companion volume store", () => {
  it("defaults an unknown kid to full volume", () => {
    expect(readKidVolume("nobody")).toBe(1);
  });

  it("persists per kid and reloads via bindKid", () => {
    useCompanionVolumeStore.getState().bindKid("kid-a");
    useCompanionVolumeStore.getState().setVolume(0.4);
    expect(readKidVolume("kid-a")).toBe(0.4);

    // A different kid is independent, then rebinding kid-a restores 0.4.
    useCompanionVolumeStore.getState().bindKid("kid-b");
    expect(useCompanionVolumeStore.getState().volume).toBe(1);
    useCompanionVolumeStore.getState().bindKid("kid-a");
    expect(useCompanionVolumeStore.getState().volume).toBe(0.4);
  });

  it("clamps out-of-range values into [0, 1]", () => {
    useCompanionVolumeStore.getState().bindKid("kid-c");
    useCompanionVolumeStore.getState().setVolume(1.8);
    expect(useCompanionVolumeStore.getState().volume).toBe(1);
    useCompanionVolumeStore.getState().setVolume(-0.5);
    expect(useCompanionVolumeStore.getState().volume).toBe(0);
  });

  it("degrades gracefully when localStorage throws", () => {
    (globalThis as { window: { localStorage: unknown } }).window.localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {},
      clear: () => {},
    };
    (globalThis as { localStorage?: unknown }).localStorage = (
      globalThis as { window: { localStorage: unknown } }
    ).window.localStorage;

    expect(readKidVolume("kid-d")).toBe(1);
    useCompanionVolumeStore.getState().bindKid("kid-d");
    // setVolume still updates in-memory state even when persistence fails.
    useCompanionVolumeStore.getState().setVolume(0.3);
    expect(useCompanionVolumeStore.getState().volume).toBe(0.3);
  });
});
