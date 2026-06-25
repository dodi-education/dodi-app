import type { ProfileFriendKeys } from "@dodi/protocol";
import { describe, expect, it } from "vitest";

import { type CachedFriendKeys, keysForProfile } from "./friend-keys-cache";

function fakeKeys(): ProfileFriendKeys {
  return {
    kem: { publicKey: new Uint8Array([1]), secretKey: new Uint8Array([2]) },
    sign: { publicKey: new Uint8Array([3]), secretKey: new Uint8Array([4]) },
  };
}

describe("keysForProfile", () => {
  it("reuses cached keys for the same profile", () => {
    const cache: CachedFriendKeys = { profileId: "kid-a", keys: fakeKeys() };
    expect(keysForProfile(cache, "kid-a")).toBe(cache.keys);
  });

  it("does NOT reuse another profile's keys after a switch (the reported bug)", () => {
    const cache: CachedFriendKeys = { profileId: "kid-a", keys: fakeKeys() };
    // Switching to kid-b must force a fresh key load, not reuse kid-a's keys.
    expect(keysForProfile(cache, "kid-b")).toBeNull();
  });

  it("returns null when nothing is cached yet", () => {
    expect(keysForProfile(null, "kid-a")).toBeNull();
  });
});
