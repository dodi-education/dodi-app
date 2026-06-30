import type { KidFriendKeys } from "@dodi/protocol";
import { describe, expect, it } from "vitest";

import { type CachedFriendKeys, keysForKid } from "./friend-keys-cache";

function fakeKeys(): KidFriendKeys {
  return {
    kem: { publicKey: new Uint8Array([1]), secretKey: new Uint8Array([2]) },
    sign: { publicKey: new Uint8Array([3]), secretKey: new Uint8Array([4]) },
  };
}

describe("keysForKid", () => {
  it("reuses cached keys for the same kid", () => {
    const cache: CachedFriendKeys = { kidId: "kid-a", keys: fakeKeys() };
    expect(keysForKid(cache, "kid-a")).toBe(cache.keys);
  });

  it("does NOT reuse another kid's keys after a switch (the reported bug)", () => {
    const cache: CachedFriendKeys = { kidId: "kid-a", keys: fakeKeys() };
    // Switching to kid-b must force a fresh key load, not reuse kid-a's keys.
    expect(keysForKid(cache, "kid-b")).toBeNull();
  });

  it("returns null when nothing is cached yet", () => {
    expect(keysForKid(null, "kid-a")).toBeNull();
  });
});
